/**
 * The picture in the generated เติมคำในรูป example, as bytes.
 *
 * This type is the one whose example cannot be written in words: the file has
 * to contain a real picture for the answer boxes to stand on, and
 * `sample-docx.test.ts` reads the generated file back through `parseDocx` and
 * expects a โจทย์ with a diagram in it.
 *
 * Inline rather than a file in `public/`, because the generator runs on the
 * server inside a bundle that carries the modules it imports and not the
 * assets beside them — a path would work in development and 404 in
 * production. It is a simple series circuit: a battery, an open switch, a lamp
 * and an ammeter, which is the same drawing the in-app example โจทย์ uses
 * (`public/samples/simple-circuit.svg`) and gives four things worth naming.
 */
const SAMPLE_DIAGRAM_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAbgAAAEYCAIAAAChtHQKAAAJOUlEQVR42u3dMU7kSBuAYe60J9iUfIkJkeYAE5DMCTrjAEhk' +
  'hIQkRBwAiYAbIMQd2G+mJVNju+223XZ3lZ9HDnZnuxn+/v565bKb5uwLgE5nXgIAoQQQSgChBBBKAKEEEEoAoQQQSgCEEkAo' +
  'AYQSQCgBhBJAKAGEEkAoARBKAKEEEEoAoQQQSgChBBBKAKEEQCgBhBJAKAGEEkAoAYQSQCgBhBJAKAEQSgChBBBKAKEEEEoA' +
  'oQQQSgChhMw9Pj3H4XVAKKHF3f3D+cXVP//+F4dWIpSwM5FCiVDCt/ePz2Yi41/jD704CCUS+bm5uU37KJEIJUgkQgkSiVDC' +
  'YRN5+ePaHRuEEnYm8uX1zYuDUCKREolQwg6RQolEKGFnIiOIEolQgkQilCCRCCXMl8jNza1EIpQUW71oXPVj1/EPHcnblcj3' +
  'j88lvw0QSpbTvEmd5m+ZRA76NkAoWdTPX5tdedoe8YCvP5+nO18i9/82QCg5oXPJ2k9kz5fI/b8N55UIJUuLffQ+eZo1kUO/' +
  'DdcrEUpO8XRyvkSO+DacVCKUf3l8ev75a+OY72huqLt33zMNeui3YXATj7V9aNNZ2ZUcsSt0zHrMNGsv7PLHqlpZcih774E6' +
  'hNIx+ljVWwhWEUobJVtvW+8DHkJZbChdjT6Fmznz3UVxM8eyEkoTPV0n8r4cbw+yrITSREs4qZz7PM4bzi0roTTRPF7q4174' +
  '9yOMlpVQmmiu55VLnsT5UAzLSihN9KSdyOeb+Zg1y0ooTRQsK6E0UbCshNJEwbISShMFy0ooTRSEUihNFLCshBKwrIRSKMGy' +
  'EkoTBctKKE0ULCuhNFGwrITSRMGyEkoTBaEUShMFhNJEActKKIUSLCuhNFGwrITSRMGyEkoTBctKKE0ULCuhNFEQSqE0UUAo' +
  'TRSwrIQSsKyE0kTBshJKEwXLSihNFCwroTRRsKyE0kTBshJKEwWhFEoTBSwroQQsK6EUSrCshNJEwbISShMFy0ooTRQsK6E0' +
  'UbCshNJEQSiF0kQBy0ooActKKIUSLCuhNFGwrITSRMGyEkoTBctKKE0ULCuhNFEo3Mvr2+PTc7qs4l/jD4VSKGHV3j8+7+4f' +
  'Ln9cb5fSriMeEA+LBwulUMK6zh97+9hazCLPMYUSqJ9Ftiby/OIqllLtiD9szWVhZ5dCCXyLHXStettrkd3PSq9dVkd8KaEU' +
  'SijtRLIWu83N7aATw3hwPKUW2TJOLYUS+N24dBM9Ze9c27nHly2glUIJKvlXJeOscPrXTE8tC2ilUMLa1XbcB1kvc3xNoRRK' +
  'OI7m3ZvpS6Z5Yyf3ezunHsrHp+fW9x8sc8Rf3Xu/D7LedKc77jRwo1tZ+yLpHjzfDfiph/KIlaxaaTlRququS/xDa+YmVnLX' +
  '3yKUQgl5eHl9az3XG93KXU9Mz1sz/bkdW29bb9Z+Otm8zT2ild1PqTbgmZ5Unvm/C6xQepbXeulwUCt7H9z71wklcHKqm90d' +
  'EdyzlUMfluPtb6GEVe+7uy8u9UZw/xPP+Ivy3X0LJaxRVbfeR3akcOilzP3/UqEEjqy6373nmzpagzjihk91Yza7e99CCatT' +
  '7YL3f/dPLYvj3kJUPSu7N5MIJQjl4FZOfKOlUAJlhvJr8kddCCUglEIJ2HrbegNCuU8l3cwByuftQUIJ9POGc6EEevgRRqEE' +
  'evhQDKEEeviYtbWE8lCf6evTeVn57tsH95YcygN+8rnf98AK+VUQQimUMOCk0i8Xs/W29YZ2fl1t+aHcf2ATf5s7FKy6/T3l' +
  'h7g7WlkdOd7sFkqgvWsHWS9zfE2hFEo45gY8vYrVvAk+Qrrjji+e76ZbKIH2Vl7+uB6dtnhidfemjEoKJfAduNp+Oc4KBzUu' +
  'HpyeSG6XXgGVFErgL817O7F8et8WEg9o3sDJ+u6NUAID9s7pJnr7SZTp0foWvSk7d6EUSsjGy+tbay67j3hKpj97I5RCCePP' +
  'LmMH3VvMeEA8rLCzSKEExpxjptcit9cuizx/FErAshJKoQTLSihNFCwroTRRsKyE0kTBshJKEwXLSihNFIRSKE0UsKyEErCs' +
  'hFIowbISShMFy0ooTRQsK6E0UbCshNJEwbISShMFoRRKEwWE0kQBy0oohRIsK6E0UbCshNJEwbISShMFy0ooTRQsK6E0URBK' +
  'oTRRQChNFLCshBKwrITSRMGyEkoTBctKKE0ULCuhNFGwrITSRMGyEkoTBaEUShMFLCuh5FS8vL49Pj3XjvhDr4xlJZQmunZR' +
  'w2pAu454QDzMa2VZCaWJrsv7x+fm5ra7j80jnhJP9OpZVkJpouW7u39oRvD84ioGVDviD5uPjKd7DS0roTTRkk8kaxvtSGGE' +
  'r+M8Mf5TPKBWzPgiTi0tK6E00TIrmfYu/nnQvZp4cO3pWmlZCaWJllzJzc3tuK+TXtnUSstKKE202EpOvIUdT9dKy0ooTbTY' +
  'EUyvZLOVxmpZCaWJZi+9x33At0OmrXQf3LISShPNe9M9/brkLun1Shtwy0ooTTRXVcvOL67m+PrVpc+DVxjLSihZSHXGN9NP' +
  'bceXrf4Kr7ZlJZQmmp/qMuJMp5O1k0o/D25ZCaWJZvzKz3qzpbpZZL6WlVCaaMb77lnvtKT3i7zmlpVQmmhOqquHs+67a7tv' +
  'n19pWQmlieakukC5wMtejdhlSstKKA8wUcdix7FC6ZVf7BDKMkPpOMqxZCgdRc5XKBfdAzqE0nHwY1WXO87K/p9nR2br7Zhp' +
  'yqu6Mnv2BW7mgFCyJG8PQiihnzecI5Sw747YjzAilNDOh2IglDBg9+1j1hBKaOeDexFK6OFXQSCU0M8vF0MooZ9fV4tQQv8G' +
  'vLqYOL2VaSXjy9p0I5SU2crR1yvT65IqiVBSeCvjnwe9ZygeXHu6SiKUlNnK2keiRe/u7h86khf/KR6QJnJ7XVIlEUpKlt4H' +
  'T4vZ/BSvWh/d40YoWdepZXq1cc8jnuJEEqFkdbYftdv7Gel+jhuhhN/3aqKGtcPnSyKUAEIJIJQAQgmAUAIIJYBQAgglgFAC' +
  'CCWAUAIIJYBQAiCUAEIJIJQAQgkglABCCSCUAEIJgFACCCWAUAIIJYBQAgglgFACCCUAQgkglABCCSCUAEIJIJQAQgkglABC' +
  'CYBQAgglgFACCCWAUAIIJYBQAqzT/zUba7u8h7a6AAAAAElFTkSuQmCC'

/** PNG bytes, decoded once. */
export const SAMPLE_DIAGRAM_PNG: Buffer = Buffer.from(SAMPLE_DIAGRAM_BASE64, 'base64')

/** Its natural size in pixels, which the boxes below are positioned against. */
export const SAMPLE_DIAGRAM_SIZE = { width: 440, height: 280 }
