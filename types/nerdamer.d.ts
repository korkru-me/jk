declare module 'nerdamer/all' {
  const nerdamer: {
    solve(equation: string, variable: string): { toString(): string }
    [key: string]: unknown
  }
  export default nerdamer
}
