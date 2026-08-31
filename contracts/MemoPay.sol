// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * MemoPay - szyna platnosci, w ktorej przelew niesie POWOD, a powod da sie
 * udowodnic bez ujawniania go swiatu.
 *
 * ===========================================================================
 * NA CZYM POLEGA POMYSL
 * ===========================================================================
 * B20 (natywny standard tokenow Base, od upgrade'u Beryl) ma cos, czego ERC-20
 * nie ma: `transferWithMemo` i indeksowane zdarzenie `Memo`. Przelew moze
 * niesc 32 bajty dowolnej tresci, a lancuch je zapamieta.
 *
 * Prawie kazdy uzywa tego jako identyfikatora zamowienia wpisanego otwartym
 * tekstem. To dziala, ale ma cene: kazdy widzi, za co placisz. Numer faktury
 * w publicznym logu to informacja handlowa oddana za darmo konkurencji.
 *
 * MemoPay wpisuje tam ZOBOWIAZANIE, a nie tresc:
 *
 *     memo = keccak256(abi.encode(payer, to, amount, invoiceRef, salt))
 *
 * Z samego memo nie da sie odczytac niczego - to skrot. Ale kto zna przedobraz,
 * moze PO FAKCIE udowodnic dowolnej osobie, ze ta konkretna transakcja
 * dotyczyla tej konkretnej faktury: pokazuje pola, kazdy przelicza skrot
 * i porownuje z lancuchem. Prywatne domyslnie, dowodliwe na zadanie, bez
 * zadnego dodatkowego kosztu i bez zaufania do nas.
 *
 * `salt` jest tu konieczny, nie ozdobny: bez niego zbior mozliwych faktur
 * bywa maly (te same kwoty, te same adresy) i skrot dalo by sie zgadnac
 * przez zwykle przeliczenie wszystkich kombinacji.
 *
 * ===========================================================================
 * CZEGO TEN KONTRAKT NIE ROBI - I TO JEST NAJWAZNIEJSZE
 * ===========================================================================
 * NIE TRZYMA PIENIEDZY. ANI PRZEZ JEDEN BLOK.
 *
 * Uzywa `transferFromWithMemo`, wiec tokeny ida BEZPOSREDNIO od placacego do
 * odbiorcy. Kontrakt jest wylacznie tym, kto wola - nigdy tym, kto trzyma.
 * Nie ma tu `rescue`, nie ma `withdraw`, nie ma roli, ktora moglaby cokolwiek
 * przesunac. Saldo tego kontraktu jest z zalozenia zerem i nie istnieje
 * sciezka, ktora by to zmienila.
 *
 * Konsekwencja dla zdarzen: `Memo` zapisuje `msg.sender`, czyli TEN kontrakt,
 * a nie placacego. Prawdziwe strony niesie zdarzenie `Transfer` emitowane
 * bezposrednio przed nim. Rozliczajacy laczy wiec pare sasiednich logow
 * w jednej transakcji - i dlatego dodatkowo emitujemy wlasne `Paid`, zeby nie
 * musial polegac na kolejnosci logow.
 *
 * ===========================================================================
 * OPLATA
 * ===========================================================================
 * Naliczana PONAD kwote, nie z niej. Odbiorca dostaje dokladnie `amount` -
 * tyle, ile mowi faktura - a placacy placi `amount + fee`. Odwrotnie byloby
 * zrodlem wiecznego sporu o to, czy faktura na 100 znaczy 100, czy 97,5.
 *
 * Stawka i odbiorca oplaty sa NIEZMIENNE (`immutable`). To swiadomy wybor:
 * kontrakt, w ktorym ktos moze podniesc oplate po tym, jak dales mu allowance,
 * wymaga zaufania - a caly sens tej konstrukcji polega na tym, ze zaufania nie
 * wymaga. Zmiana stawki znaczy nowy kontrakt pod nowym adresem, ktory kazdy
 * moze porownac ze starym.
 *
 * Twardy sufit MAX_FEE_BPS pilnuje, ze nawet przy wdrozeniu z bledna wartoscia
 * nie powstanie kontrakt zabierajacy polowe przelewu.
 */

/* -------------------------------------------------------------------------- */
/*  INTERFEJSY B20                                                             */
/* -------------------------------------------------------------------------- */

interface IB20 {
    function transferFromWithMemo(address from, address to, uint256 amount, bytes32 memo)
        external
        returns (bool);

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function balanceOf(address account) external view returns (uint256);
}

interface IB20Factory {
    /** Czy pod tym adresem stoi ZAINICJALIZOWANY token B20. */
    function isB20Initialized(address token) external view returns (bool);
}

contract MemoPay {
    /* ---------------------------------------------------------------------- */
    /*  STALE                                                                  */
    /* ---------------------------------------------------------------------- */

    /**
     * Fabryka B20 to precompile pod staly adresem na kazdej sieci Base.
     *
     * UWAGA dla czytajacego kod: `eth_getCode` pod tym adresem zwraca pustke,
     * bo precompile zyje w oprogramowaniu wezla, a nie jako bajtkod EVM -
     * dokladnie tak samo jak `ecrecover` pod 0x01. Brak kodu NIE znaczy, ze
     * fabryki nie ma.
     */
    address public constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;

    /** Sufit oplaty: 2.5%. Ten sam, co w AskEscrow - jeden produkt, jedna stawka maksymalna. */
    uint16 public constant MAX_FEE_BPS = 250;

    /* ---------------------------------------------------------------------- */
    /*  KONFIGURACJA - NIEZMIENNA                                              */
    /* ---------------------------------------------------------------------- */

    uint16 public immutable feeBps;
    address public immutable feeRecipient;

    /* ---------------------------------------------------------------------- */
    /*  ZDARZENIA                                                              */
    /* ---------------------------------------------------------------------- */

    /**
     * Pelny obraz platnosci w JEDNYM zdarzeniu.
     *
     * Istnieje, mimo ze lancuch i tak emituje `Transfer` + `Memo`, bo tamta
     * para wymaga laczenia logow po sasiedztwie w transakcji. Kto rozlicza
     * ksiegowosc, ma tu wszystko naraz i nie musi znac wewnetrznej kolejnosci
     * zdarzen B20.
     */
    event Paid(
        address indexed token,
        address indexed payer,
        address indexed to,
        uint256 amount,
        uint256 fee,
        bytes32 memo
    );

    /** Platnosc do wielu odbiorcow pod jednym memo - naglowek przed pozycjami. */
    event PaidBatch(
        address indexed token,
        address indexed payer,
        bytes32 indexed memo,
        uint256 recipients,
        uint256 total,
        uint256 fee
    );

    /* ---------------------------------------------------------------------- */
    /*  BLEDY                                                                  */
    /* ---------------------------------------------------------------------- */

    error FeeTooHigh();
    error ZeroAddress();
    error ZeroAmount();
    error NotB20(address token);
    error LengthMismatch();
    error NoRecipients();
    error TooManyRecipients();
    error TransferRejected();

    /** Gorna granica jednej paczki. Chroni przed transakcja, ktora nie zmiesci sie w bloku. */
    uint256 public constant MAX_RECIPIENTS = 100;

    constructor(uint16 _feeBps, address _feeRecipient) {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
    }

    /* ---------------------------------------------------------------------- */
    /*  ZOBOWIAZANIE                                                           */
    /* ---------------------------------------------------------------------- */

    /**
     * Skrot, ktory trafia do memo.
     *
     * `pure` i publiczna celowo: liczy to samo, co policzy przegladarka przed
     * wyslaniem i co policzy KAZDY, kto pozniej weryfikuje przedobraz. Jedna
     * definicja zamiast trzech kopii, ktore rozjada sie przy pierwszej zmianie.
     */
    function commitment(
        address payer,
        address to,
        uint256 amount,
        bytes32 invoiceRef,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(payer, to, amount, invoiceRef, salt));
    }

    /**
     * Czy podany przedobraz pasuje do memo widzianego na lancuchu.
     *
     * Nie ma tu zadnego stanu - to wygoda dla weryfikujacego, zeby nie musial
     * odtwarzac kodowania u siebie i pomylic sie w kolejnosci pol.
     */
    function verify(
        bytes32 memo,
        address payer,
        address to,
        uint256 amount,
        bytes32 invoiceRef,
        bytes32 salt
    ) external pure returns (bool) {
        return memo == commitment(payer, to, amount, invoiceRef, salt);
    }

    /* ---------------------------------------------------------------------- */
    /*  PLATNOSC                                                               */
    /* ---------------------------------------------------------------------- */

    /**
     * Oplata liczona PONAD kwote. Dzielenie w gore byloby zabieraniem grosza
     * placacemu bez powodu, wiec idzie w dol - a przy stawce zerowej nie ma
     * zadnego przelewu oplaty, zamiast przelewu na zero.
     */
    function feeFor(uint256 amount) public view returns (uint256) {
        return (amount * feeBps) / 10_000;
    }

    function pay(address token, address to, uint256 amount, bytes32 memo)
        external
        returns (uint256 fee)
    {
        return _pay(token, msg.sender, to, amount, memo);
    }

    /**
     * Platnosc bez osobnej transakcji `approve`.
     *
     * B20 wspiera ERC-2612, wiec placacy podpisuje zgode zamiast wysylac
     * pierwsza transakcje. Dla czlowieka roznica jest taka, ze placi RAZ,
     * a nie dwa razy pod rzad - a to wlasnie na tej drugiej transakcji ludzie
     * odpadaja. Podpis obejmuje kwote z oplata, bo tyle realnie opusci portfel.
     */
    function payWithPermit(
        address token,
        address to,
        uint256 amount,
        bytes32 memo,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 fee) {
        uint256 total = amount + feeFor(amount);
        // Podpis moze zostac zuzyty przez kogos innego w wyscigu (znany
        // przypadek przy permit). Wtedy allowance i tak juz jest, wiec brak
        // reakcji na blad jest tu POPRAWNY - a nie zamiecony pod dywan.
        try IB20(token).permit(msg.sender, address(this), total, deadline, v, r, s) {} catch {}
        return _pay(token, msg.sender, to, amount, memo);
    }

    /**
     * Jedna platnosc do wielu odbiorcow, wszystkie pod TYM SAMYM memo.
     *
     * Po co: wyplata za pieciu wykonawcow jednej roboty to jedno zdarzenie
     * gospodarcze, a nie piec. Wspolne memo pozwala pozniej udowodnic, ze te
     * piec przelewow nalezalo do jednej faktury.
     */
    function paySplit(
        address token,
        address[] calldata to,
        uint256[] calldata amounts,
        bytes32 memo
    ) external returns (uint256 fee) {
        uint256 count = to.length;
        if (count != amounts.length) revert LengthMismatch();
        if (count == 0) revert NoRecipients();
        if (count > MAX_RECIPIENTS) revert TooManyRecipients();
        _requireB20(token);

        uint256 total;
        for (uint256 i; i < count; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
            _move(token, msg.sender, to[i], amounts[i], memo);
            emit Paid(token, msg.sender, to[i], amounts[i], 0, memo);
        }

        // Oplata liczona od SUMY, a nie od kazdej pozycji osobno: sumowanie
        // zaokraglen w dol na stu pozycjach potrafi zgubic grosze, a placacy
        // ma widziec jedna stawke od jednej faktury.
        fee = feeFor(total);
        if (fee > 0) _move(token, msg.sender, feeRecipient, fee, memo);

        emit PaidBatch(token, msg.sender, memo, count, total, fee);
    }

    /* ---------------------------------------------------------------------- */
    /*  SRODEK                                                                 */
    /* ---------------------------------------------------------------------- */

    function _pay(address token, address payer, address to, uint256 amount, bytes32 memo)
        private
        returns (uint256 fee)
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _requireB20(token);

        fee = feeFor(amount);

        // Odbiorca przed oplata - ale BEZ udawania, ze to cokolwiek zabezpiecza.
        // Transakcja jest atomowa: jesli przelew oplaty odpadnie, cofa sie takze
        // przelew do odbiorcy. Kolejnosc daje tylko czytelniejszy porzadek
        // logow (najpierw platnosc, potem prowizja) i nic ponad to.
        _move(token, payer, to, amount, memo);
        if (fee > 0) _move(token, payer, feeRecipient, fee, memo);

        emit Paid(token, payer, to, amount, fee, memo);
    }

    /**
     * Jeden przelew z memo, bezposrednio miedzy stronami.
     *
     * Sprawdzamy zwracana wartosc, mimo ze B20 rewertuje przy niepowodzeniu:
     * token, ktory oddaje `false` zamiast rewertowac, przepuscilby platnosc
     * jako udana, a odbiorca nie dostalby nic.
     */
    function _move(address token, address from, address to, uint256 amount, bytes32 memo) private {
        bool ok = IB20(token).transferFromWithMemo(from, to, amount, memo);
        if (!ok) revert TransferRejected();
    }

    /**
     * Tylko prawdziwe, zainicjalizowane B20.
     *
     * `isB20` z fabryki sprawdza sam FORMAT adresu i zwraca `true` takze dla
     * tokena, ktorego jeszcze nie ma - sprawdzone na mainnecie. Do istnienia
     * sluzy `isB20Initialized` i tylko on daje tu sens.
     *
     * Bez tej bramki adres bez kodu przyjalby wywolanie jako udane (w EVM
     * `call` do pustego adresu zwraca sukces), a zdarzenie `Paid` twierdziloby,
     * ze pieniadze poszly, gdy nie poszly nigdzie.
     */
    function _requireB20(address token) private view {
        if (!IB20Factory(B20_FACTORY).isB20Initialized(token)) revert NotB20(token);
    }
}
