# 🌐 Linea Network Integration

Integracja sieci Linea z platformą MySphere - umożliwia tworzenie postów onchain na sieci Linea.

## 📋 Struktura Folderów

```
app/basechat/Linea/
├── contracts/
│   ├── LineaPostContract.sol      # Smart contract dla postów
│   └── LineaPostContract.ts       # TypeScript wrapper z ABI
├── components/
│   ├── TransactionButtonLinea.tsx # Przycisk transakcji
│   └── CreatePostLinea.tsx        # Komponent tworzenia posta
├── config/
│   └── LineaNetworkConfig.ts      # Konfiguracja sieci
├── scripts/
│   └── deploy-linea.ts            # Skrypt deployu
├── hardhat-linea.config.ts        # Konfiguracja Hardhat
├── package.json                   # Scripts dla Linea
└── README.md                      # Ta dokumentacja
```

## 🚀 Kroki Deployu

### 1. Przygotowanie

```bash
# Ustaw zmienną środowiskową z kluczem prywatnym
export PRIVATE_KEY="your_private_key_here"

# Sprawdź balans ETH na Linea mainnet
# Potrzebujesz ~0.01 ETH na gas
```

### 2. Deploy Kontraktu

```bash
cd app/basechat/Linea
npm run deploy-linea
```

### 3. Weryfikacja Kontraktu

```bash
npm run verify-linea CONTRACT_ADDRESS
```

### 4. Aktualizacja Konfiguracji

Po udanym deployu zaktualizuj:

```typescript
// app/basechat/Linea/contracts/LineaPostContract.ts
export const LINEA_CONTRACT_ADDRESS = 'DEPLOYED_CONTRACT_ADDRESS';
```

## 🔧 Konfiguracja

### Environment Variables

```env
PRIVATE_KEY=your_ethereum_private_key
ETHERSCAN_API_KEY=HSHV72NNW6KVQA88YB5BFSZHTVPFWC2GJU
```

### Network Details

- **Chain ID:** 59144 (0xe708)
- **Native Currency:** ETH
- **RPC URL:** https://linea-rpc.publicnode.com
- **Explorer:** https://lineascan.build
- **API:** https://api.lineascan.build/api

## 🎯 Funkcjonalność

### Smart Contract

```solidity
contract LineaPostContract is Ownable, Pausable {
    function createPost(string memory contentHash) public whenNotPaused;
    function getPostCount(address user) public view returns (uint256);
    function getTotalPosts() public view returns (uint256);
    function pause() public onlyOwner;
    function unpause() public onlyOwner;
}
```

### UI Components

- **TransactionButtonLinea:** Przycisk do przełączania sieci i wysyłania transakcji
- **CreatePostLinea:** Formularz tworzenia posta z obsługą mediów i muzyki

### Network Switching

- Automatyczne wykrywanie sieci Linea
- Przełączanie z innych sieci na Linea
- Obsługa błędów i statusów

## 🔗 Integracja z Firebase

Posty z Linea są oznaczane jako:

```typescript
{
  network: 'linea',
  txHash: 'transaction_hash',
  // ... inne pola
}
```

## 🧪 Testowanie

1. **Lokalne testowanie:**
   ```bash
   npm run test-linea
   ```

2. **Testowanie na frontend:**
   - Połącz wallet z siecią Linea
   - Sprawdź przełączanie sieci
   - Przetestuj tworzenie posta
   - Sprawdź zapisywanie do Firebase

## 📊 Monitoring

- **Lineascan:** https://lineascan.build/address/CONTRACT_ADDRESS
- **API Calls:** Etherscan API z kluczem HSHV72NNW6KVQA88YB5BFSZHTVPFWC2GJU
- **Gas Tracking:** Hardhat gas reporter

## 🔒 Security

- Kontrakt używa OpenZeppelin Ownable i Pausable
- Tylko właściciel może wstrzymać/wznowić kontrakt
- Walidacja danych po stronie smart contractu
- Rate limiting po stronie aplikacji

## 🆘 Troubleshooting

### Błędy Deployu

1. **Insufficient funds:** Upewnij się, że masz ETH na Linea
2. **Network error:** Sprawdź RPC URL i połączenie
3. **Gas estimation failed:** Zwiększ gas limit w konfiguracji

### Błędy Transakcji

1. **User rejected:** Użytkownik odrzucił transakcję
2. **Network mismatch:** Sprawdź czy wallet jest na Linea
3. **Contract paused:** Kontrakt może być wstrzymany

### Debug Commands

```bash
# Sprawdź balans
cast balance YOUR_ADDRESS --rpc-url https://linea-rpc.publicnode.com

# Sprawdź czy kontrakt istnieje
cast code CONTRACT_ADDRESS --rpc-url https://linea-rpc.publicnode.com

# Wywołaj funkcję read-only
cast call CONTRACT_ADDRESS "totalPosts()" --rpc-url https://linea-rpc.publicnode.com
```

## 📝 TODO

- [ ] Deploy kontraktu na Linea mainnet
- [ ] Aktualizacja adresu w konfiguracji
- [ ] Integracja z providers.tsx
- [ ] Dodanie przycisku Linea do UI
- [ ] Testy end-to-end
- [ ] Dokumentacja dla użytkowników