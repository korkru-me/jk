#!/usr/bin/python3
"""Fail-closed directory-relative filesystem operations for S5 evidence.

The trusted directory is inherited as file descriptor 3. Every name-based
operation uses a *at syscall through Python's dir_fd API; this module never
falls back to resolving a caller-provided directory pathname.
"""

import base64
import json
import os
import re
import stat
import sys
import time


DIRECTORY_FD = 3
MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_FILE_BYTES = 1024 * 1024
SAFE_NAME = re.compile(r"^[a-z0-9.-]{1,160}$")


def emit(value, exit_code=0):
    sys.stdout.write(json.dumps(value, separators=(",", ":")))
    sys.stdout.flush()
    raise SystemExit(exit_code)


def fail(code="failed", ownership=None):
    value = {"ok": False, "code": code}
    if ownership is not None:
        value["ownership"] = ownership
    emit(value, 1)


def exact_record(value, fields):
    return isinstance(value, dict) and set(value.keys()) == set(fields)


def safe_name(value):
    return (
        isinstance(value, str)
        and SAFE_NAME.fullmatch(value) is not None
        and value not in (".", "..")
        and "/" not in value
        and "\\" not in value
        and "\x00" not in value
    )


def identity(value):
    return {"dev": str(value.st_dev), "ino": str(value.st_ino)}


def ownership(value, name):
    return {
        "name": name,
        "dev": str(value.st_dev),
        "ino": str(value.st_ino),
    }


def same_identity(value, expected):
    return (
        isinstance(expected, dict)
        and set(expected.keys()) >= {"dev", "ino"}
        and str(value.st_dev) == expected.get("dev")
        and str(value.st_ino) == expected.get("ino")
    )


def require_directory(request):
    directory = request.get("directory")
    if not exact_record(directory, ["dev", "ino"]):
        fail()
    current = os.fstat(DIRECTORY_FD)
    if (
        not stat.S_ISDIR(current.st_mode)
        or not same_identity(current, directory)
        or not hasattr(os, "getuid")
        or current.st_uid != os.getuid()
        or current.st_mode & 0o077
    ):
        fail()


def require_primitives():
    required = (os.open, os.stat, os.link, os.unlink)
    if any(operation not in os.supports_dir_fd for operation in required):
        fail("unsupported")
    if os.link not in os.supports_follow_symlinks:
        fail("unsupported")
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        fail("unsupported")


def read_request():
    raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        fail()
    try:
        value = json.loads(raw.decode("utf-8"))
    except Exception:
        fail()
    if not isinstance(value, dict):
        fail()
    return value


def stat_name(name):
    return os.stat(name, dir_fd=DIRECTORY_FD, follow_symlinks=False)


def regular_owned(value, expected, *, links=None):
    if not stat.S_ISREG(value.st_mode) or not same_identity(value, expected):
        return False
    return links is None or value.st_nlink == links


def sync_directory():
    os.fsync(DIRECTORY_FD)


def probe(request):
    if not exact_record(request, ["directory"]):
        fail()
    require_directory(request)
    sync_directory()
    emit({"ok": True})


def create_owned(request):
    if not exact_record(request, ["directory", "name", "bytesBase64"]):
        fail()
    require_directory(request)
    name = request.get("name")
    encoded = request.get("bytesBase64")
    if not safe_name(name) or not isinstance(encoded, str):
        fail()
    try:
        payload = base64.b64decode(encoded, validate=True)
    except Exception:
        fail()
    if len(payload) > MAX_FILE_BYTES:
        fail()

    file_fd = None
    created = None
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        if hasattr(os, "O_CLOEXEC"):
            flags |= os.O_CLOEXEC
        file_fd = os.open(name, flags, 0o600, dir_fd=DIRECTORY_FD)
        current = os.fstat(file_fd)
        created = ownership(current, name)
        if not regular_owned(current, created, links=1):
            fail(ownership=created)
        view = memoryview(payload)
        written = 0
        while written < len(view):
            count = os.write(file_fd, view[written:])
            if count <= 0:
                fail(ownership=created)
            written += count
        os.fsync(file_fd)
        os.close(file_fd)
        file_fd = None
        current = stat_name(name)
        if not regular_owned(current, created, links=1):
            fail(ownership=created)
        sync_directory()
        emit({"ok": True, "ownership": created})
    except FileExistsError:
        fail("exists")
    except SystemExit:
        raise
    except Exception:
        fail(ownership=created)
    finally:
        if file_fd is not None:
            try:
                os.close(file_fd)
            except Exception:
                pass


def link_owned(request):
    base_fields = ["directory", "source", "destination"]
    test_mode = os.environ.get("SEB_STAGING_DIRECTORY_IO_TEST_MODE") == "1"
    if not (
        exact_record(request, base_fields)
        or (
            test_mode
            and exact_record(
                request,
                base_fields + ["testPauseAfterStatMs", "testNotifyAfterStatName"],
            )
        )
    ):
        fail()
    require_directory(request)
    source = request.get("source")
    destination = request.get("destination")
    if not exact_record(source, ["name", "dev", "ino"]):
        fail()
    if not safe_name(source.get("name")) or not safe_name(destination):
        fail()
    pause_ms = request.get("testPauseAfterStatMs", 0)
    notify_name = request.get("testNotifyAfterStatName")
    if not isinstance(pause_ms, int) or pause_ms < 0 or pause_ms > 2_000:
        fail()
    if notify_name is not None and not safe_name(notify_name):
        fail()
    destination_created = False
    destination_ownership = None

    def rollback_created_destination():
        if not destination_created or destination_ownership is None:
            return False
        try:
            current = stat_name(destination)
            if not regular_owned(current, destination_ownership):
                return False
            os.unlink(destination, dir_fd=DIRECTORY_FD)
            sync_directory()
            return True
        except Exception:
            return False

    try:
        before = stat_name(source["name"])
        if not regular_owned(before, source, links=1):
            fail("identity-mismatch")
        if notify_name is not None:
            notify_fd = os.open(
                notify_name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=DIRECTORY_FD,
            )
            os.write(notify_fd, b"ready")
            os.fsync(notify_fd)
            os.close(notify_fd)
            sync_directory()
        if pause_ms:
            time.sleep(pause_ms / 1_000)
        os.link(
            source["name"],
            destination,
            src_dir_fd=DIRECTORY_FD,
            dst_dir_fd=DIRECTORY_FD,
            follow_symlinks=False,
        )
        destination_created = True
        destination_after = stat_name(destination)
        destination_ownership = ownership(destination_after, destination)
        source_after = stat_name(source["name"])
        if (
            not regular_owned(source_after, source, links=2)
            or not regular_owned(destination_after, source, links=2)
        ):
            rollback_created_destination()
            fail("identity-mismatch")
        sync_directory()
        emit({"ok": True, "status": "linked"})
    except FileExistsError:
        try:
            current_source = stat_name(source["name"])
        except Exception:
            fail("identity-mismatch")
        if not regular_owned(current_source, source, links=1):
            fail("identity-mismatch")
        emit({"ok": True, "status": "exists"})
    except SystemExit:
        raise
    except Exception:
        rollback_created_destination()
        fail()


def read_regular(request):
    if not exact_record(request, ["directory", "name"]):
        fail()
    require_directory(request)
    name = request.get("name")
    if not safe_name(name):
        fail()
    file_fd = None
    try:
        flags = os.O_RDONLY | os.O_NOFOLLOW
        if hasattr(os, "O_CLOEXEC"):
            flags |= os.O_CLOEXEC
        file_fd = os.open(name, flags, dir_fd=DIRECTORY_FD)
        current = os.fstat(file_fd)
        current_ownership = ownership(current, name)
        if not regular_owned(current, current_ownership, links=1):
            fail()
        chunks = []
        total = 0
        while True:
            chunk = os.read(file_fd, 64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_FILE_BYTES:
                fail()
            chunks.append(chunk)
        after = stat_name(name)
        if not regular_owned(after, current_ownership, links=1):
            fail("identity-mismatch")
        os.close(file_fd)
        file_fd = None
        emit({
            "ok": True,
            "ownership": current_ownership,
            "bytesBase64": base64.b64encode(b"".join(chunks)).decode("ascii"),
        })
    except SystemExit:
        raise
    except Exception:
        fail()
    finally:
        if file_fd is not None:
            try:
                os.close(file_fd)
            except Exception:
                pass


def unlink_owned(request):
    if not exact_record(request, ["directory", "ownership"]):
        fail()
    require_directory(request)
    expected = request.get("ownership")
    if not exact_record(expected, ["name", "dev", "ino"]):
        fail()
    if not safe_name(expected.get("name")):
        fail()
    try:
        current = stat_name(expected["name"])
        if not regular_owned(current, expected):
            fail("identity-mismatch")
        os.unlink(expected["name"], dir_fd=DIRECTORY_FD)
        try:
            stat_name(expected["name"])
            fail("still-present")
        except FileNotFoundError:
            pass
        sync_directory()
        emit({"ok": True})
    except FileNotFoundError:
        emit({"ok": True})
    except SystemExit:
        raise
    except Exception:
        fail()


def main():
    require_primitives()
    if len(sys.argv) != 2:
        fail()
    request = read_request()
    operation = sys.argv[1]
    operations = {
        "probe": probe,
        "create-owned": create_owned,
        "link-owned": link_owned,
        "read-regular": read_regular,
        "unlink-owned": unlink_owned,
    }
    handler = operations.get(operation)
    if handler is None:
        fail()
    handler(request)


if __name__ == "__main__":
    main()
