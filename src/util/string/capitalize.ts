/** Make upper case first letter of each space separated word */
export function capitalize (text: string): string {
  return text.replace(/(?:^|(?<=\s))(\w)/gu, char => char.toUpperCase());
}
