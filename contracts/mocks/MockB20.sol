// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {B20AssetCreateParams} from "../launchpad/interfaces/IB20Asset.sol";

/**
 * Atrapy B20 na potrzeby testow MemoPay i CurveLaunchpad.
 *
 * ===========================================================================
 * PO CO ONE ISTNIEJA
 * ===========================================================================
 * B20 nie jest kontraktem - jest PRECOMPILE'EM wkompilowanym w oprogramowanie
 * wezla Base. Na lokalnym EVM Hardhata nie ma go wcale i nie da sie go tam
 * wdrozyc. Bez atrap `MemoPay` bylby kontraktem, ktorego nie sposob uruchomic
 * poza siecia produkcyjna - czyli takim, ktorego pierwszy prawdziwy przebieg
 * odbywa sie na cudzych pieniadzach.
 *
 * Atrapa odtwarza dokladnie te czesc zachowania, na ktorej stoi MemoPay:
 *  - `transferFromWithMemo` zdejmuje allowance i emituje `Transfer`,
 *    a NATYCHMIAST PO NIM `Memo(msg.sender, memo)` - w tej kolejnosci, bo
 *    rozliczanie po sasiedztwie logow zalezy wlasnie od niej,
 *  - `Memo` niesie WOLAJACEGO, a nie placacego. To nie jest uproszczenie
 *    atrapy, tylko realny ksztalt zdarzenia w B20 i wlasnie dlatego MemoPay
 *    emituje wlasne `Paid`.
 *
 * ===========================================================================
 * ROZSZERZENIE NA POTRZEBY LAUNCHPADA
 * ===========================================================================
 * `CurveLaunchpad` asertuje po utworzeniu tokena: `totalSupply`, `supplyCap`,
 * `balanceOf` i BRAK czterech rol. Zeby te asercje mialy co sprawdzac (i zeby
 * dalo sie przetestowac, ze KAZDA z nich potrafi wywrocic start), atrapa dostaje
 * role, sufit podazy i zwykly `transfer`/`transferFrom`.
 *
 * Czego atrapa DALEJ nie udaje - i to jest wazne, zeby nikt nie wzial testu
 * lokalnego za dowod:
 *  - `mint` jest tu BEZ UPRAWNIEN. Launchpad nie mintuje po utworzeniu tokena
 *    ani razu, wiec egzekwowanie roli MINT dawaloby zludzenie pokrycia tam,
 *    gdzie zadnego kodu produkcyjnego nie ma. Prawdziwy B20 to egzekwuje.
 *  - polityk transferu (blocklista) i pauzy nie ma w ogole,
 *  - wyprowadzenie adresu tokena jest tu CREATE2, a nie formatem 0xb2...
 *    precompile'a. Launchpad nie zaklada formatu adresu - porownuje wynik
 *    z `getB20Address` tej samej fabryki - wiec sciezka wywolania jest ta sama.
 *
 * Jedyny prawdziwy test B20 to transakcja na Base Sepolia albo mainnecie.
 */
contract MockB20 {
    string public name = "Mock B20";
    string public symbol = "MB20";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    uint256 public totalSupply;

    /** 0 znaczy "bez sufitu" - tak samo jak w B20 przed `updateSupplyCap`. */
    uint256 public supplyCap;

    mapping(bytes32 => mapping(address => bool)) private _roles;

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    /** Do testow asercji post-warunkow: pozwala ozywic role, ktorej nie powinno byc. */
    function setRole(bytes32 role, address account, bool value) external {
        _roles[role][account] = value;
    }

    /** Wolane przez atrape fabryki w oknie bootstrapu. */
    function initMeta(string calldata name_, string calldata symbol_, uint8 decimals_) external {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function updateSupplyCap(uint256 cap) external {
        supplyCap = cap;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (returnsFalse) return false;
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (returnsFalse) return false;
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    /** Kolejnosc zdarzen jest tu czescia kontraktu, nie szczegolem. */
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Memo(address indexed caller, bytes32 indexed memo);

    /** Przelacznik do testu tokena, ktory ODDAJE `false` zamiast rewertowac. */
    bool public returnsFalse;

    /** Przelacznik do testu `permit`, ktory odpada - MemoPay ma to przezyc. */
    bool public permitReverts;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function setReturnsFalse(bool value) external {
        returnsFalse = value;
    }

    function setPermitReverts(bool value) external {
        permitReverts = value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFromWithMemo(address from, address to, uint256 amount, bytes32 memo)
        external
        returns (bool)
    {
        if (returnsFalse) return false;

        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        // `type(uint256).max` jako allowance bez konca - tak robi wiekszosc
        // tokenow i MemoPay nie ma prawa sie na tym wylozyc.
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        emit Memo(msg.sender, memo);
        return true;
    }

    /**
     * Uproszczony ERC-2612: NIE sprawdza podpisu, tylko ustawia allowance.
     *
     * Powod: testujemy MemoPay, a nie kryptografie tokena. Sprawdzanie podpisu
     * tutaj testowaloby atrape. Wazne jest to, ze po `permit` allowance
     * ISTNIEJE i ze MemoPay nie wywraca sie, gdy `permit` odpadnie.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8,
        bytes32,
        bytes32
    ) external {
        if (permitReverts) revert("permit");
        require(deadline >= block.timestamp, "expired");
        allowance[owner][spender] = value;
        nonces[owner] += 1;
        emit Approval(owner, spender, value);
    }
}

/**
 * Wariant tokena, ktory MA `SEIZE_ROLE()`.
 *
 * Istnieje po to, zeby dalo sie przetestowac, ze `CurveLaunchpad` odmawia
 * startu, gdy stala `VARIANT_ASSET` wskazuje na zly wariant. Odczyt z mainnetu
 * mowi, ze ASSET tego selektora NIE MA (konfiskata to sprawa wariantu
 * STABLECOIN), i wlasnie na tym opiera sie asercja wariantu w launchpadzie.
 */
contract MockB20Seizable is MockB20 {
    function SEIZE_ROLE() external pure returns (bytes32) {
        return keccak256("SEIZE_ROLE");
    }
}

/**
 * Atrapa fabryki-precompile'a spod 0xB20f...0000.
 *
 * W tescie jej bajtkod laduje POD TYM ADRESEM przez `hardhat_setCode`, bo
 * MemoPay i CurveLaunchpad maja ten adres wpisany jako stala - dokladnie tak,
 * jak bedzie na Base. Dzieki temu testujemy realna sciezke wywolania, a nie
 * wersje z wstrzyknietym adresem fabryki, ktorej na produkcji nie ma.
 *
 * `hardhat_setCode` wgrywa sam KOD, bez stanu, wiec po podlozeniu atrapa jest
 * pusta i konfiguruje sie zwyklymi wywolaniami.
 */
contract MockB20Factory {
    mapping(address => bool) public initialized;

    /**
     * Sposob na zepsucie startu, zeby dalo sie sprawdzic, ze KAZDA asercja
     * post-warunkow potrafi wywrocic `launch`. Bez tego asercje sa napisane,
     * ale nieprzetestowane - czyli dokladnie tym, czym byc nie powinny.
     *
     * 0 = czysty start
     * 1 = admin zostaje przy zyciu (initialAdmin jest ignorowany)
     * 2 = mintujemy inna podaz niz zadano
     * 3 = sufit podazy zostaje nieustawiony
     * 4 = token nie zostaje oznaczony jako zainicjalizowany
     * 5 = fabryka zwraca inny adres, niz sama wylicza
     * 6 = MINT_ROLE zostaje przy zyciu u wolajacego (czyli u launchpada)
     * 7 = PAUSE_ROLE zostaje przy zyciu u wolajacego
     * 8 = wariant 0 tworzy token Z konfiskata (MockB20Seizable)
     *
     * Tryb 8 istnieje dla asercji wariantu. Podmiana musi objac TAKZE
     * `getB20Address`, inaczej start odbilby sie wczesniej na niezgodnym
     * adresie i `WrongVariant` nigdy by nie odpalilo - czyli test przechodzilby
     * na innym warunku, niz twierdzi.
     *
     * Tryby 6 i 7 istnieja po to, zeby asercje `RolesAlive(MINT_ROLE)`
     * i `RolesAlive(PAUSE_ROLE)` dalo sie ZOBACZYC, jak odpadaja. Asercja,
     * ktorej nikt nigdy nie widzial rewertujacej, jest nieodrozninalna od
     * literowki w nazwie roli - a wtedy caly niezmiennik "nikt nie dodrukuje"
     * opiera sie na tym, ze skrot nazwy zostal przepisany bez bledu.
     */
    uint8 public sabotage;

    event B20Created(address indexed token, uint8 variant, bytes32 salt);

    function setInitialized(address token, bool value) external {
        initialized[token] = value;
    }

    function setSabotage(uint8 mode) external {
        sabotage = mode;
    }

    function isB20Initialized(address token) external view returns (bool) {
        return initialized[token];
    }

    /**
     * Odwzorowuje realne zachowanie, ktore zaskoczylo nas na mainnecie:
     * `isB20` sprawdza sam FORMAT adresu i mowi `true` takze o tokenie, ktorego
     * jeszcze nie ma. Atrapa trzyma to zachowanie, zeby nikt nie wpadl na
     * pomysl uzycia go jako sprawdzenia istnienia.
     */
    function isB20(address token) external pure returns (bool) {
        return uint160(token) >> 152 == 0xb2;
    }

    /**
     * Adres tokena. U precompile'a jest to 0xb2 + zera + bajt wariantu + 9
     * bajtow hasza; tutaj CREATE2, bo lokalny EVM nie potrafi wdrozyc kodu pod
     * adres z gory zadany.
     *
     * Wazne jest to, ze WARIANT wchodzi do wyprowadzenia - dzieki temu
     * porownanie `token == getB20Address(VARIANT_ASSET, launchpad, salt)`
     * w launchpadzie naprawde wiaze wynik z wariantem, tak jak na produkcji.
     */
    function getB20Address(uint8 variant, address deployer, bytes32 salt) public view returns (address) {
        bytes32 create2Salt = keccak256(abi.encode(variant, deployer, salt));
        bytes32 codeHash = (variant == 0 && sabotage != 8)
            ? keccak256(type(MockB20).creationCode)
            : keccak256(type(MockB20Seizable).creationCode);
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), create2Salt, codeHash))))
        );
    }

    /**
     * `initCalls` sa wykonywane BEZ sprawdzania rol - tak dziala okno bootstrapu
     * prawdziwej fabryki i to jest jedyny powod, dla ktorego token bez
     * administratora moze miec w ogole jakakolwiek podaz.
     */
    function createB20(uint8 variant, bytes32 salt, bytes calldata params, bytes[] calldata initCalls)
        external
        payable
        returns (address token)
    {
        // Prawdziwa fabryka rewertuje NonPayable() na kazde wei mimo `payable`.
        require(msg.value == 0, "NonPayable");

        // Dekodujemy jako STRUKTURE, bo launchpad koduje `abi.encode(struct)`.
        // Roznica jest realna: struktura dynamiczna na najwyzszym poziomie ma
        // przed soba offset, krotka pol - nie ma. Ktora z tych postaci przyjmuje
        // prawdziwy precompile, jest NIEPOTWIERDZONE (punkt O10 specyfikacji)
        // i rozstrzyga to dopiero pierwsza transakcja na Base Sepolia.
        B20AssetCreateParams memory p = abi.decode(params, (B20AssetCreateParams));
        require(p.version == 1, "version");
        string memory name_ = p.name;
        string memory symbol_ = p.symbol;
        address initialAdmin = p.initialAdmin;
        uint8 decimals_ = p.decimals;

        bytes32 create2Salt = keccak256(abi.encode(variant, msg.sender, salt));
        if (variant == 0 && sabotage != 8) {
            token = address(new MockB20{salt: create2Salt}());
        } else {
            token = address(new MockB20Seizable{salt: create2Salt}());
        }
        MockB20(token).initMeta(name_, symbol_, decimals_);

        if (initialAdmin != address(0) || sabotage == 1) {
            // bytes32(0) == DEFAULT_ADMIN_ROLE
            MockB20(token).setRole(bytes32(0), initialAdmin == address(0) ? msg.sender : initialAdmin, true);
        }
        if (sabotage == 6) MockB20(token).setRole(keccak256("MINT_ROLE"), msg.sender, true);
        if (sabotage == 7) MockB20(token).setRole(keccak256("PAUSE_ROLE"), msg.sender, true);

        for (uint256 i; i < initCalls.length; ++i) {
            bytes memory call_ = initCalls[i];
            if (sabotage == 2 && _first4(call_) == bytes4(keccak256("mint(address,uint256)"))) {
                // Mintujemy o jedna jednostke za malo - `SupplyMismatch`.
                (address to, uint256 amount) = abi.decode(_tail(call_), (address, uint256));
                MockB20(token).mint(to, amount - 1);
                continue;
            }
            if (sabotage == 3 && _first4(call_) == bytes4(keccak256("updateSupplyCap(uint256)"))) {
                continue; // sufit zostaje zerem - `CapMismatch`
            }
            (bool ok,) = token.call(call_);
            require(ok, "initCall");
        }

        if (sabotage != 4) initialized[token] = true;
        emit B20Created(token, variant, salt);

        if (sabotage == 5) return address(uint160(token) ^ 1);
    }

    function _first4(bytes memory data) private pure returns (bytes4 out) {
        assembly {
            out := mload(add(data, 32))
        }
    }

    function _tail(bytes memory data) private pure returns (bytes memory out) {
        out = new bytes(data.length - 4);
        for (uint256 i; i < out.length; ++i) {
            out[i] = data[i + 4];
        }
    }
}
