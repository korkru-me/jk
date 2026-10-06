import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = fileURLToPath(new URL('../public/brand/deer-mark-source.png', import.meta.url))
const destination = fileURLToPath(new URL('../public/brand/deer-mark.svg', import.meta.url))

const { data, info } = await sharp(source)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height, channels } = info
const objectMask = new Uint8Array(width * height)
const orangeMask = new Uint8Array(width * height)

for (let index = 0; index < objectMask.length; index += 1) {
  const offset = index * channels
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  const distanceFromWhite = Math.hypot(255 - red, 255 - green, 255 - blue)

  if (distanceFromWhite < 40) continue

  objectMask[index] = 1
  orangeMask[index] = red > green * 1.35 && red > blue * 1.8 ? 1 : 0
}

const keepLargestComponent = (mask) => {
  const seen = new Uint8Array(mask.length)
  let largest = []

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue

    const component = []
    const queue = [start]
    seen[start] = 1

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]
      component.push(current)
      const x = current % width
      const y = Math.floor(current / width)
      const neighbours = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ]

      for (const neighbour of neighbours) {
        if (neighbour >= 0 && mask[neighbour] && !seen[neighbour]) {
          seen[neighbour] = 1
          queue.push(neighbour)
        }
      }
    }

    if (component.length > largest.length) largest = component
  }

  const result = new Uint8Array(mask.length)
  for (const index of largest) result[index] = 1
  return result
}

const cleanObjectMask = keepLargestComponent(objectMask)
const cleanOrangeMask = keepLargestComponent(orangeMask)
const cleanBlueMask = new Uint8Array(objectMask.length)

for (let index = 0; index < cleanBlueMask.length; index += 1) {
  cleanBlueMask[index] = cleanObjectMask[index] && !cleanOrangeMask[index] ? 1 : 0
}

const pointKey = ([x, y]) => `${x},${y}`
const samePoint = ([ax, ay], [bx, by]) => ax === bx && ay === by

const traceContours = (mask) => {
  const edges = []
  const outgoing = new Map()
  const isFilled = (x, y) => x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x]
  const addEdge = (from, to) => {
    const edgeIndex = edges.length
    edges.push({ from, to, used: false })
    const key = pointKey(from)
    const list = outgoing.get(key) ?? []
    list.push(edgeIndex)
    outgoing.set(key, list)
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isFilled(x, y)) continue
      if (!isFilled(x, y - 1)) addEdge([x, y], [x + 1, y])
      if (!isFilled(x + 1, y)) addEdge([x + 1, y], [x + 1, y + 1])
      if (!isFilled(x, y + 1)) addEdge([x + 1, y + 1], [x, y + 1])
      if (!isFilled(x - 1, y)) addEdge([x, y + 1], [x, y])
    }
  }

  const contours = []
  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (edges[startIndex].used) continue

    const start = edges[startIndex].from
    const contour = [start]
    let edgeIndex = startIndex

    while (edgeIndex !== undefined && !edges[edgeIndex].used) {
      const edge = edges[edgeIndex]
      edge.used = true
      contour.push(edge.to)
      if (samePoint(edge.to, start)) break
      edgeIndex = (outgoing.get(pointKey(edge.to)) ?? []).find((candidate) => !edges[candidate].used)
    }

    if (contour.length > 4 && samePoint(contour[0], contour.at(-1))) contours.push(contour.slice(0, -1))
  }

  return contours
}

const squaredDistanceToSegment = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return (px - ax) ** 2 + (py - ay) ** 2
  const amount = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx ** 2 + dy ** 2)))
  const x = ax + amount * dx
  const y = ay + amount * dy
  return (px - x) ** 2 + (py - y) ** 2
}

const simplifyOpenPath = (points, tolerance) => {
  if (points.length <= 2) return points
  const threshold = tolerance ** 2
  let farthestIndex = -1
  let farthestDistance = threshold

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredDistanceToSegment(points[index], points[0], points.at(-1))
    if (distance > farthestDistance) {
      farthestDistance = distance
      farthestIndex = index
    }
  }

  if (farthestIndex < 0) return [points[0], points.at(-1)]

  const left = simplifyOpenPath(points.slice(0, farthestIndex + 1), tolerance)
  const right = simplifyOpenPath(points.slice(farthestIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

const simplifyClosedPath = (points, tolerance = 1.25) => {
  let oppositeIndex = 1
  let farthestDistance = -1

  for (let index = 1; index < points.length; index += 1) {
    const distance = (points[index][0] - points[0][0]) ** 2 + (points[index][1] - points[0][1]) ** 2
    if (distance > farthestDistance) {
      farthestDistance = distance
      oppositeIndex = index
    }
  }

  const firstHalf = simplifyOpenPath(points.slice(0, oppositeIndex + 1), tolerance)
  const secondHalf = simplifyOpenPath([...points.slice(oppositeIndex), points[0]], tolerance)
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)]
}

const signedArea = (points) => points.reduce((area, [x, y], index) => {
  const [nextX, nextY] = points[(index + 1) % points.length]
  return area + x * nextY - nextX * y
}, 0) / 2

const formatNumber = (value) => Number(value.toFixed(2))

const toSmoothPath = (points) => {
  const commands = [`M${points[0][0]} ${points[0][1]}`]

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const afterNext = points[(index + 2) % points.length]
    const firstControl = [
      current[0] + (next[0] - previous[0]) / 6,
      current[1] + (next[1] - previous[1]) / 6,
    ]
    const secondControl = [
      next[0] - (afterNext[0] - current[0]) / 6,
      next[1] - (afterNext[1] - current[1]) / 6,
    ]

    commands.push(
      `C${formatNumber(firstControl[0])} ${formatNumber(firstControl[1])}`
      + ` ${formatNumber(secondControl[0])} ${formatNumber(secondControl[1])}`
      + ` ${next[0]} ${next[1]}`,
    )
  }

  return `${commands.join('')}Z`
}

const toPathData = (mask) => traceContours(mask)
  .filter((contour) => Math.abs(signedArea(contour)) > 16)
  .map((contour) => simplifyClosedPath(contour))
  .map(toSmoothPath)
  .join('')

let minX = width
let minY = height
let maxX = 0
let maxY = 0

for (let index = 0; index < cleanObjectMask.length; index += 1) {
  if (!cleanObjectMask[index]) continue
  const x = index % width
  const y = Math.floor(index / width)
  minX = Math.min(minX, x)
  minY = Math.min(minY, y)
  maxX = Math.max(maxX, x + 1)
  maxY = Math.max(maxY, y + 1)
}

const padding = 4
const viewBox = [minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2]
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg"',
  ` viewBox="${viewBox.join(' ')}"`,
  ` width="${viewBox[2]}" height="${viewBox[3]}">`,
  `<path fill="#002262" fill-rule="evenodd" d="${toPathData(cleanBlueMask)}"/>`,
  `<path fill="#fe5d00" fill-rule="evenodd" d="${toPathData(cleanOrangeMask)}"/>`,
  '</svg>\n',
].join('')

await writeFile(destination, svg)
console.log(`Wrote ${destination} with viewBox ${viewBox.join(' ')}`)
