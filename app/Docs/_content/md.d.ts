// Import plikow .md jako surowy string (webpack `type: 'asset/source'`, patrz
// next.config.js). Dzieki temu strony dokumentacji robia `import content from
// './x.md'` i dostaja markdown gotowy do przekazania do <DocArticle />.
declare module '*.md' {
  const content: string;
  export default content;
}
