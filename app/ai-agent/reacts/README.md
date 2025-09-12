# React Components Library

Ten folder zawiera kolekcję komponenty React do wykorzystania w projekcie AI Agent.

## Struktura

Każdy komponent ma swój własny folder z następującą strukturą:
```
ComponentName/
├── ComponentName.tsx    # Główny komponent
├── ComponentName.css    # Style CSS (jeśli potrzebne)
└── index.ts            # Export file
```

## Dostępne komponenty

### StarBorder
Komponent tworzący animowaną ramkę w kształcie gwiazdy wokół elementów.

**Użycie:**
```tsx
import StarBorder from './reacts/StarBorder'

<StarBorder
  as="button"
  className="custom-class"
  color="cyan"
  speed="5s"
>
  // content
</StarBorder>
```

**Props:**
- `as` - Element HTML do renderowania (domyślnie "button")
- `className` - Dodatkowe klasy CSS
- `color` - Kolor animacji (domyślnie "white")
- `speed` - Szybkość animacji (domyślnie "6s")
- `thickness` - Grubość ramki (domyślnie 1)
- `children` - Zawartość komponentu

## Dodawanie nowych komponentów

1. Utwórz nowy folder z nazwą komponentu
2. Dodaj plik `ComponentName.tsx` z kodem komponentu
3. Dodaj plik `ComponentName.css` jeśli potrzebne
4. Utwórz plik `index.ts` z eksportem
5. Zaktualizuj ten README z dokumentacją
