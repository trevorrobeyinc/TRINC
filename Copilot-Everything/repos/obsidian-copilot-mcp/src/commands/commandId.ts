export function getCommandId(commandName: string) {
  return encodeURIComponent(commandName.toLowerCase());
}
