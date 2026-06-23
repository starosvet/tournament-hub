export function parseImport(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const [name, url] = line.split("|").map(s => s.trim());

      return {
        id: name.toLowerCase().replace(/\s/g, "_"),
        name,
        url,
        wins: 0,
        losses: 0
      };
    });
}
