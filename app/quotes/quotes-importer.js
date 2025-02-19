const fs = require('fs');
const path = require('path');

// Funkcja do wczytania cytatów z pliku JSON
function loadQuotesFromJson(filePath) {
  try {
    const jsonData = fs.readFileSync(filePath, 'utf8');
    const quotes = JSON.parse(jsonData);
    console.log('Wczytano surowe cytaty:', quotes.length);
    return quotes.map(quote => ({
      text: quote.Quote || quote.text || quote.quote || '',
      author: quote.Author || quote.author || 'Nieznany'
    })).filter(quote => quote.text && quote.text.trim() !== '');
  } catch (error) {
    console.error('Błąd podczas wczytywania pliku JSON:', error);
    return [];
  }
}

// Funkcja do wygenerowania pliku TypeScript z cytatami
function generateQuotesFile(quotes, outputPath) {
  const quotesTs = `// Ten plik został wygenerowany automatycznie
export interface Quote {
  text: string;
  author: string;
}

export const quotesDatabase: Quote[] = ${JSON.stringify(quotes, null, 2)};
`;

  try {
    fs.writeFileSync(outputPath, quotesTs, 'utf8');
    console.log('Plik z cytatami został wygenerowany pomyślnie!');
  } catch (error) {
    console.error('Błąd podczas zapisywania pliku:', error);
  }
}

// Ścieżki do plików
const inputPath = path.join(__dirname, 'quotes.json');
const outputPath = path.join(__dirname, 'quotes-data.ts');

console.log('Ścieżka do pliku wejściowego:', inputPath);
console.log('Ścieżka do pliku wyjściowego:', outputPath);

// Wczytaj cytaty i wygeneruj plik
const quotes = loadQuotesFromJson(inputPath);
if (quotes.length > 0) {
  generateQuotesFile(quotes, outputPath);
  console.log(`Zaimportowano ${quotes.length} cytatów.`);
} else {
  console.error('Nie udało się wczytać żadnych cytatów!');
} 