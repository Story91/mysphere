// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ILaunchTokenConfig {
    function pendingConfig()
        external
        view
        returns (string memory name, string memory symbol, uint256 supply, address mintTo);
}

/**
 * TOKEN DLA SIECI, KTORA NIE MA B20.
 *
 * ===========================================================================
 * CZEGO TU NIE MA - I TO JEST CALA TRESC TEGO PLIKU
 * ===========================================================================
 * Nie ma `owner`. Nie ma `mint`. Nie ma `burn`. Nie ma `pause`, `blacklist`,
 * `seize`, `upgradeTo`, `setName`, ani jednego settera. Nie ma `AccessControl`
 * i nie ma roli, ktora moglaby zostac komus nadana pozniej, bo nie ma funkcji,
 * ktora by ja nadawala.
 *
 * Podaz jest wybijana RAZ, w konstruktorze, w calosci na jeden adres.
 * `totalSupply` jest `immutable`. Od chwili wdrozenia nie istnieje wywolanie -
 * czyjekolwiek, lacznie z naszym - ktore zmieni cokolwiek poza saldami i
 * zezwoleniami.
 *
 * Na Base te same obietnice wymusza siec (B20 ma sufit podazy w protokole).
 * Tutaj wymusza je BRAK KODU, ktory moglby je zlamac. Druga droga jest slabsza
 * pod jednym wzgledem i trzeba to nazwac: na Base da sie odczytac `supplyCap()`
 * i udowodnic sobie, ze dodruk jest niemozliwy, nie czytajac zrodla. Tutaj
 * dowodem jest ten plik. Dlatego `supplyCap()` istnieje takze tu i zwraca
 * `totalSupply` - zeby strona tokena zadawala oba lancuchy tym samym pytaniem.
 *
 * ===========================================================================
 * DLACZEGO KONSTRUKTOR NIE MA ARGUMENTOW
 * ===========================================================================
 * Argumenty konstruktora sa czescia kodu tworzacego, wiec adres CREATE2
 * zalezalby od nazwy i tickera. Dwa tokeny o tej samej nazwie chcialyby ten sam
 * adres, a `predictToken(salt)` nie dalby sie w ogole napisac. Konfiguracja jest
 * wiec ODCZYTYWANA z fabryki w trakcie konstrukcji: kod tworzacy jest staly,
 * a adres zalezy wylacznie od (fabryka, salt).
 */
contract LaunchToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public immutable totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /* --- ERC-2612, zeby sprzedaz na krzywej szla jedna transakcja zamiast dwoch --- */
    mapping(address => uint256) public nonces;
    bytes32 private immutable _INITIAL_DOMAIN_SEPARATOR;
    uint256 private immutable _INITIAL_CHAIN_ID;
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error PermitExpired();
    error InvalidSigner();

    constructor() {
        (string memory name_, string memory symbol_, uint256 supply_, address mintTo_) =
            ILaunchTokenConfig(msg.sender).pendingConfig();

        name = name_;
        symbol = symbol_;
        totalSupply = supply_;
        balanceOf[mintTo_] = supply_;

        _INITIAL_CHAIN_ID = block.chainid;
        _INITIAL_DOMAIN_SEPARATOR = _computeDomainSeparator(name_);

        // Wybicie calej podazy jest zdarzeniem z adresu zerowego - inaczej
        // indekser, ktory sumuje `Transfer`, nigdy nie zobaczy skad wzielo sie
        // pierwsze saldo i pokaze zerowa liste posiadaczy.
        emit Transfer(address(0), mintTo_, supply_);
    }

    /**
     * Sufit podazy. Rowny podazy, bo dodruku nie ma jako funkcji.
     *
     * Istnieje wylacznie po to, zeby czytajacy (nasza strona tokena, obcy
     * skaner) zadal to samo pytanie na Base i tutaj i dostal odpowiedz o tym
     * samym znaczeniu.
     */
    function supplyCap() external view returns (uint256) {
        return totalSupply;
    }

    /**
     * Zadna rola nie nalezy do nikogo, bo zadnej roli nie ma.
     *
     * Nie jest to uprzejmosc wobec interfejsu: fabryka asertuje brak rol na
     * KAZDYM tokenie, ktory wypuszcza, i ma zadawac to pytanie tak samo
     * niezaleznie od sieci. Odpowiedz `false` jest tu prawda strukturalna,
     * a nie zaslepka.
     */
    function hasRole(bytes32, address) external pure returns (bool) {
        return false;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        // Fork lancucha zmienia chainid, a podpis zwiazany ze stara domena
        // przestaje byc wazny. Przeliczamy zamiast podawac zapisana wartosc.
        return block.chainid == _INITIAL_CHAIN_ID ? _INITIAL_DOMAIN_SEPARATOR : _computeDomainSeparator(name);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            unchecked {
                allowance[from][msg.sender] = allowed - amount;
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        if (block.timestamp > deadline) revert PermitExpired();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );

        address recovered = ecrecover(digest, v, r, s);
        // `ecrecover` oddaje adres zerowy przy zlym podpisie, wiec bez tego
        // warunku podpis-smiec autoryzowalby wydatek z adresu zerowego.
        if (recovered == address(0) || recovered != owner) revert InvalidSigner();

        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _transfer(address from, address to, uint256 amount) private {
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = fromBalance - amount;
            // Suma sald rowna sie `totalSupply`, ktore jest ustalone raz, wiec
            // ta strona nie ma jak sie przepelnic.
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _computeDomainSeparator(string memory name_) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name_)),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }
}
