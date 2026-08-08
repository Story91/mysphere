// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * Atrapy B20 na potrzeby testow MemoPay.
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
 * Czego atrapa NIE udaje: rol, list dopuszczen, blokad, sufitu podazy ani
 * przejmowania srodkow. MemoPay ich nie dotyka, wiec udawanie ich tutaj
 * dawaloby zludzenie pokrycia testami tam, gdzie go nie ma.
 */
contract MockB20 {
    string public name = "Mock B20";
    string public symbol = "MB20";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

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
 * Atrapa fabryki-precompile'a spod 0xB20f...0000.
 *
 * W tescie jej bajtkod ladue POD TYM ADRESEM przez `hardhat_setCode`, bo
 * MemoPay ma ten adres wpisany jako stala - dokladnie tak, jak bedzie na Base.
 * Dzieki temu testujemy realna sciezke wywolania, a nie wersje z wstrzyknietym
 * adresem fabryki, ktorej na produkcji nie ma.
 */
contract MockB20Factory {
    mapping(address => bool) public initialized;

    function setInitialized(address token, bool value) external {
        initialized[token] = value;
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
}
