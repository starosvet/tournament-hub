function parseImport(text) {
  return text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [name, url] = line.split("|").map(x => x.trim());

      return {
        id: name.toLowerCase().replace(/\s+/g, "_"),
        name,
        url,
        wins: 0,
        losses: 0
      };
    });
}
