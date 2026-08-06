// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ASK ESCROW - pieniadze pod Aska blokuja sie PRZY ZAKLADANIU, nie przy wyplacie.
 *
 * === PO CO TO ISTNIEJE ===
 * Manifest (app/re-definition/page.tsx, sekcja "$2.00 - one seat, one answer")
 * obiecuje: "You set all three, fund it once in USDC". Repo tej obietnicy nie
 * dotrzymywalo - app/utils/asks/types.ts nazywa dzisiejszy wariant 'on-resolve'
 * i sam pisze, ze escrow NIE MA. Ten kontrakt jest brakujacym kawalkiem i tylko
 * nim: przenosi ryzyko KUSTODII z portfela autora do kodu.
 *
 * Odpowiadajacy pracuje ZANIM dostanie pieniadze. Jedyne, co go chroni przed
 * autorem, ktory zniknie, to mozliwosc sprawdzenia PRZED napisaniem odpowiedzi,
 * ze na jego miejsce naprawde lezy zablokowana kwota. Stad publiczny odczyt
 * escrows(key) - bez niego slowo "escrow" jest reklama, nie faktem.
 *
 * === CZEGO KONTRAKT NIE WIE ===
 * Nie widzi tresci odpowiedzi, ich liczby ani ich autorow. Odpowiedzi sa
 * zapieczetowane w Firestore (kolekcja z regula `if false`), a tu przyjezdzaja
 * wylacznie ADRESY, ktore autor wskazal, i skroty identyfikatorow odpowiedzi
 * jako dowod, ktora odpowiedz odpowiada ktorej wyplacie.
 *
 * === WZORZEC WYPLATY: KSIEGOWANIE, NIE PRZELEW (i dlaczego to WAZNE) ===
 * resolve() nie wysyla tokenow. PRZYPISUJE salda (claimable) i dopiero claim()
 * / claimFor() je wysyla. Powod jest brutalnie praktyczny: USDC ma czarna
 * liste Circle, a portfel odbiorcy moze byc kontraktem, ktory rewertuje. Gdyby
 * resolve() wysylalo tokeny w petli, JEDEN taki adres na liscie zwyciezcow
 * wywracalby CALE rozstrzygniecie - i kazdy moglby to wywolac celowo, pisujac
 * jedna odpowiedz z zablokowanego adresu. Przy ksiegowaniu awaria jest
 * odizolowana do jednego wywolania claim, a reszta paczki jest juz przypisana.
 *
 * "Payout leaves immediately" z manifestu znaczy wiec: w chwili resolve srodki
 * PRZESTAJA BYC AUTORA nieodwracalnie (nie ma w kodzie sciezki, ktora by mu je
 * oddala), a dostarczenie robi claimFor() wolane przez aplikacje. To mocniejsza
 * obietnica niz dzisiejszy 'on-resolve', ale to NIE jest przelew na konto -
 * i UI musi mowic to samo, co robi kod.
 *
 * === ZERO ROL ADMINISTRACYJNYCH ===
 * Brak owner, brak pause, brak upgrade, brak funkcji ratunkowej. feeBps i
 * feeRecipient sa immutable z twardym limitem sprawdzanym w konstruktorze.
 * Na escrow "pauza" znaczy "uzytkownik nie odzyska pieniedzy", czyli dokladnie
 * to, przed czym escrow ma chronic. Zmiana oplaty = nowy deployment. To jest
 * cena braku rugu i placimy ja swiadomie.
 *
 * === JEDNOSTKI - MIEJSCE, GDZIE NAJLATWIEJ POMYLIC SIE O 10^12 ===
 * Wszystkie kwoty sa w JEDNOSTKACH BAZOWYCH USDC, ktore ma 6 MIEJSC
 * dziesietnych (nie 18). 1 USDC = 1_000_000. Deadline jest w SEKUNDACH,
 * a Ask.deadline w repo trzyma MILISEKUNDY - konwersja nalezy do wolajacego
 * i musi siedziec w JEDNYM miejscu po stronie klienta.
 */

/**
 * Minimalny interfejs tokena. Nie importujemy OpenZeppelina swiadomie: kontrakt
 * ma zero zaleznosci zewnetrznych, wiec to, co czyta audytor, jest calym kodem,
 * ktory sie wykona. `balanceOf` celowo NIE jest zadeklarowane - ksiegowosc
 * nigdy nie czyta salda tokena (patrz komentarz przy totalLiabilities).
 */
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AskEscrow {
    // ------------------------------------------------------------------
    // Stan
    // ------------------------------------------------------------------

    /**
     * Warunki jednego Aska. Trzy pola = 224 bity = JEDEN slot.
     *
     * Czego tu NIE MA i dlaczego:
     * - autora: siedzi w KLUCZU mapy, wiec przechowywanie go byloby duplikatem
     *   (i drugim zrodlem prawdy o tym, kto moze rozstrzygac),
     * - budzetu: budzet to z definicji seats * perAnswer, wiec osobne pole
     *   mogloby sie z nim rozjechac,
     * - licznika wyplaconych miejsc: resolve jest TERMINALNE, wiec nie istnieje
     *   stan posredni, ktory trzeba by liczyc,
     * - tokena: jeden na deployment, immutable.
     */
    struct Escrow {
        uint128 perAnswer; // jednostki bazowe USDC (6 miejsc)
        uint64 deadline;   // sekundy epoch - koniec przyjmowania odpowiedzi
        uint32 seats;      // ile miejsc jeszcze zyje; 0 == zamkniete
    }

    /**
     * JEDYNE zrodlo, z ktorego wychodza pieniadze do rozdzielenia.
     * Klucz: keccak256(abi.encode(author, askId)) - patrz keyFor().
     */
    mapping(bytes32 => Escrow) public escrows;

    /**
     * Komu ile sie nalezy. To JEDYNE zrodlo prawdy o tym, czyje sa pieniadze
     * po rozstrzygnieciu.
     *
     * UWAGA na asymetrie, ktora jest tu celowa: saldo odpowiadajacego NIE MA
     * ZADNEJ sciezki powrotu do kogokolwiek innego. Nie ma clawbacku po czasie,
     * nie ma przedawnienia na rzecz autora, nie ma escheatu do skarbca.
     * Kazdy taki termin waznosci byłby uprawnieniem do zabrania cudzego
     * zarobku, a takie uprawnienie predzej czy pozniej zostanie uzyte albo
     * wyludzone. Cena: saldo kogos, kto stracil portfel, zostaje tu na zawsze.
     */
    mapping(address => uint256) public claimable;

    /**
     * Suma wszystkiego, co kontrakt jest komus winien: escrow jeszcze
     * nierozdzielony PLUS wszystkie salda claimable.
     *
     * NIEZMIENNIK: USDC.balanceOf(this) >= totalLiabilities, zawsze.
     *
     * Po co, skoro nie ma funkcji zamiatajacej nadwyzke? Zeby KTOKOLWIEK z
     * zewnatrz mogl sprawdzic wyplacalnosc kontraktu dwoma odczytami, bez
     * indeksowania zdarzen i bez zaufania do nas. To jest tez niezmiennik,
     * ktory ma sprawdzac fuzzing przed jakimkolwiek deployem.
     *
     * Ksiegowosc NIGDY nie czyta balanceOf. Dzieki temu USDC wyslane
     * bezposrednio na adres kontraktu (pomylka, darowizna, atak) nie zmienia
     * ANI JEDNEGO wyliczenia - a poniewaz nie ma owner ani funkcji ratunkowej,
     * taka nadwyzka jest nie do odzyskania. Swiadomie: funkcja "rescue" to
     * wieksza dziura niz to, co lata.
     */
    uint256 public totalLiabilities;

    // ------------------------------------------------------------------
    // Konfiguracja - ustawiona RAZ, nie do zmiany przez nikogo
    // ------------------------------------------------------------------

    /** USDC na Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 miejsc). */
    address public immutable TOKEN;

    /** Odbiorca oplaty. Immutable, wiec nie da sie przekierowac oplat po fakcie. */
    address public immutable FEE_RECIPIENT;

    /** Oplata w punktach bazowych, pobierana WYLACZNIE na sciezce wygasniecia. */
    uint16 public immutable FEE_BPS;

    /**
     * Twardy sufit oplaty, sprawdzany w konstruktorze. Jest w KODZIE, a nie w
     * konfiguracji deployu, bo ma ograniczac takze tego, kto wdraza.
     */
    uint16 public constant MAX_FEE_BPS = 500; // 5%

    /**
     * Gorna granica petli w resolve(). Odpowiada MAX_SEATS = 20 z
     * app/utils/asks/types.ts. To NIE jest polityka produktowa, tylko limit
     * bezpieczenstwa: Ask, ktorego nie da sie rozstrzygnac, bo petla nie miesci
     * sie w bloku, jest gorszy niz Ask, ktorego nie da sie zalozyc.
     */
    uint32 public constant MAX_SEATS = 20;

    /**
     * Najdalszy dopuszczalny termin. ASK_DURATIONS koncza sie na 7 dniach,
     * wiec 30 dni to spory zapas - a jednoczesnie zabezpieczenie przed
     * literowka w milisekundach, ktora zamrozilaby czyjes pieniadze na lata.
     */
    uint64 public constant MAX_DURATION = 30 days;

    /**
     * Okno na PRZECZYTANIE odpowiedzi, liczone po deadline.
     *
     * Bez niego kontrakt byl by nie do uzycia: odpowiedzi wplywaja do samej
     * ostatniej sekundy, wiec autor mialby zero czasu, zeby je przeczytac
     * i wskazac. Okno jest tez buforem na zatloczony blok.
     *
     * Rowna sie tez granicy, od ktorej wolno zamykac Aska jako wygasly - dzieki
     * czemu okna resolve i settleExpired sa ROZLACZNE. Gdyby settleExpired bylo
     * dostepne od sekundy deadline, ktokolwiek moglby frontrunowac uczciwe
     * rozstrzygniecie i pozbawic odpowiadajacych zaplaty.
     */
    uint64 public constant RESOLVE_GRACE = 48 hours;

    // ------------------------------------------------------------------
    // Zdarzenia - to one sa "linkiem do transakcji" z manifestu
    // ------------------------------------------------------------------

    event AskFunded(
        bytes32 indexed key,
        address indexed author,
        bytes32 indexed askId,
        uint128 perAnswer,
        uint32 seats,
        uint64 deadline
    );

    /**
     * Jeden log na JEDNA przyjeta odpowiedz.
     *
     * answerRef = skrot identyfikatora dokumentu odpowiedzi. Bez niego
     * rozstrzygniecie piecioosobowe daje piec przelewow w jednej transakcji
     * i odpowiedz moze linkowac tylko do "jakiejs transakcji w paczce".
     * Z nim linkuje do KONKRETNEGO wpisu w logu - i to jest dowod, na ktorym
     * stoi caly produkt.
     */
    event SeatAwarded(
        bytes32 indexed key,
        address indexed recipient,
        bytes32 indexed answerRef,
        uint256 amount
    );

    event AskResolved(
        bytes32 indexed key,
        address indexed author,
        uint32 seatsAwarded,
        uint256 refundToAuthor
    );

    event AskExpired(
        bytes32 indexed key,
        address indexed author,
        uint256 refundToAuthor,
        uint256 fee
    );

    /** `caller` jest osobno od `account`, bo przy claimFor to sa rozne osoby. */
    event Claimed(address indexed account, uint256 amount, address indexed caller);

    // ------------------------------------------------------------------
    // Bledy
    // ------------------------------------------------------------------

    error ZeroAddress();
    error TokenHasNoCode();
    error FeeTooHigh();
    error InvalidAmount();
    error InvalidSeats();
    error DeadlineInPast();
    error DeadlineTooFar();
    error AlreadyFunded();
    error NotOpen();
    error NoWinners();
    error LengthMismatch();
    error TooManyWinners();
    error InvalidWinner();
    error DuplicateWinner();
    error MissingAnswerRef();
    error ResolveWindowClosed();
    error TooEarly();
    /**
     * Przed terminem wolno zamknac Aska tylko wypelniajac KAZDE miejsce.
     * Inaczej autor odzyskiwalby niewykorzystane miejsca w dowolnej chwili -
     * takze po przeczytaniu naplywajacych odpowiedzi. Patrz resolve().
     */
    error EarlyResolveMustFillSeats();
    error NothingToClaim();
    error TransferFailed();
    error Reentrancy();

    // ------------------------------------------------------------------
    // Ochrona przed wejsciem powrotnym
    // ------------------------------------------------------------------

    /**
     * Reentrancja jest tu zamknieta DWIEMA niezaleznymi warstwami, bo
     * poprawnosc nie powinna zalezec od jednej.
     *
     * 1. STRUKTURALNIE: istnieje dokladnie JEDNA funkcja wysylajaca tokeny
     *    (_payout). Zeruje saldo i zmniejsza zobowiazania PRZED transferem
     *    i nie czyta stanu po nim. Ponowne wejscie zastaje saldo 0.
     * 2. JAWNIE: ten straznik, na funkcjach, ktore wykonuja wywolanie zewnetrzne.
     *
     * Startujemy od 1, a nie od 0, zeby pierwsze uzycie nie placilo 20k gazu
     * za zapis do zerowego slotu.
     */
    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ------------------------------------------------------------------
    // Konstruktor
    // ------------------------------------------------------------------

    constructor(address token_, address feeRecipient_, uint16 feeBps_) {
        if (token_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        // Adres tokena podany z palca to najlatwiejsza pomylka przy deployu.
        // Kontrakt bez kodu przyjmowalby kazde wywolanie transferu jako sukces
        // (patrz _call), wiec escrow "dzialalby", nie przenoszac ani centa.
        if (token_.code.length == 0) revert TokenHasNoCode();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();

        TOKEN = token_;
        FEE_RECIPIENT = feeRecipient_;
        FEE_BPS = feeBps_;
    }

    // ------------------------------------------------------------------
    // Odczyty
    // ------------------------------------------------------------------

    /**
     * Kodowanie klucza w JEDNYM miejscu, zeby frontend, trasa serwerowa i testy
     * nigdy go nie zgadywaly i nie rozjechaly sie z kontraktem.
     *
     * Autor jest czescia preimage'a z dwoch powodow:
     * 1. askId jest JAWNY w feedzie. Gdyby mapa byla kluczowana samym askId,
     *    ktokolwiek moglby wyprzedzic autora, wpisac sie za jedna jednostke
     *    USDC i na zawsze zablokowac finansowanie tego Aska - DoS za grosze.
     * 2. Klucz jest samouwierzytelniajacy: jesli podany autor odtwarza istniejacy
     *    wpis, to JEST autorem. Dlatego adresu autora nie trzeba trzymac w slocie
     *    ani go z niczym porownywac.
     */
    function keyFor(address author, bytes32 askId) public pure returns (bytes32) {
        return keccak256(abi.encode(author, askId));
    }

    /**
     * Wszystko, czego potrzebuje trasa serwerowa, zeby przestawic pole `funding`
     * w Firestore na 'escrowed'.
     *
     * Serwer MUSI porownac perAnswer/seats/deadline z dokumentem Aska i NIGDY
     * nie ufac hashowi transakcji przyslanemu przez klienta - klient moze wyslac
     * dowolny hash. To ta sama zasada, ktora obowiazuje juz przy tozsamosci.
     *
     * `budget` to kwota WCIAZ zablokowana (po zamknieciu jest zerem, bo miejsca
     * zostaly rozksiegowane na salda).
     */
    function escrowFor(address author, bytes32 askId)
        external
        view
        returns (
            uint128 perAnswer,
            uint64 deadline,
            uint32 seats,
            uint256 budget,
            bool funded,
            bool open
        )
    {
        Escrow memory e = escrows[keyFor(author, askId)];
        perAnswer = e.perAnswer;
        deadline = e.deadline;
        seats = e.seats;
        budget = uint256(e.perAnswer) * e.seats;
        // perAnswer zostaje po zamknieciu jako nagrobek - patrz fund().
        funded = e.perAnswer != 0;
        open = e.seats != 0;
    }

    /** Do kiedy autor moze rozstrzygnac. Zeby UI odliczalo to samo, co kod. */
    function resolveDeadline(address author, bytes32 askId) external view returns (uint256) {
        return uint256(escrows[keyFor(author, askId)].deadline) + RESOLVE_GRACE;
    }

    // ------------------------------------------------------------------
    // 1. Finansowanie
    // ------------------------------------------------------------------

    /**
     * Zaklada i finansuje Aska JEDNYM przelewem. Wymaga wczesniejszego approve
     * na dokladnie seats * perAnswer.
     *
     * Bierzemy perAnswer, a NIE budzet - to jest istotne. perAnswerFor() w
     * types.ts tnie budzet W DOL, wiec reszta z dzielenia nigdy nie opuszcza
     * portfela autora i kontrakt nie ma pylu do sprzatania. Suma wyplat rowna
     * sie zablokowanej kwocie co do jednostki, obiema sciezkami.
     *
     * UWAGA DLA WOLAJACEGO: perAnswerFor() tnie do CENTA (2 miejsca), a USDC ma
     * 6. Klient MUSI wyslac perAnswerFor(budget, seats) * 1e6, a nie
     * budget * 1e6 / seats - inaczej karta obieca inna kwote niz lancuch.
     *
     * Minimalnej kwoty (MIN_PER_ANSWER = 0.5 USDC) tu NIE MA celowo: to polityka
     * cenowa, ktora ma prawo sie zmieniac, a kontrakt jest niezmienny. Miejsce
     * na nia jest w UI. Kontrakt pilnuje bezpieczenstwa srodkow, nie cennika.
     */
    function fund(bytes32 askId, uint128 perAnswer, uint32 seats, uint64 deadline)
        external
        nonReentrant
    {
        if (perAnswer == 0) revert InvalidAmount();
        if (seats == 0 || seats > MAX_SEATS) revert InvalidSeats();
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (uint256(deadline) > block.timestamp + MAX_DURATION) revert DeadlineTooFar();

        // msg.sender ZOSTAJE autorem - nie ma parametru `author`. Inaczej dalo by
        // sie zalozyc Aska w czyims imieniu i to on odbieralby zwrot.
        bytes32 key = keyFor(msg.sender, askId);
        Escrow storage e = escrows[key];

        // perAnswer != 0 znaczy "ten klucz byl juz uzyty" - takze wtedy, gdy Ask
        // jest juz zamkniety, bo przy zamknieciu zerujemy WYLACZNIE seats.
        // Dzieki temu nagrobkowi tego samego Aska nie da sie sfinansowac drugi
        // raz i nie kosztuje to ani jednego slotu wiecej.
        if (e.perAnswer != 0) revert AlreadyFunded();

        uint256 budget = uint256(perAnswer) * seats;

        e.perAnswer = perAnswer;
        e.deadline = deadline;
        e.seats = seats;
        totalLiabilities += budget;

        emit AskFunded(key, msg.sender, askId, perAnswer, seats, deadline);

        // Interakcja na koncu (CEI). Gdyby transferFrom sie nie powiodl, cala
        // transakcja jest cofana razem z zapisem stanu.
        _safeTransferFrom(msg.sender, address(this), budget);
    }

    // ------------------------------------------------------------------
    // 2. Rozstrzygniecie
    // ------------------------------------------------------------------

    /**
     * Autor wskazuje przyjete odpowiedzi. Kazdy zwyciezca dostaje DOKLADNIE
     * perAnswer zamrozone przy fund - autor nie podaje kwot, tylko adresy, wiec
     * nie da sie "wyplacic" komus jednostki i reszty wziac dla siebie.
     *
     * Niewykorzystane miejsca wracaja do autora BEZ oplaty - rozstrzygnal.
     * Oplata jest wylacznie na sciezce wygasniecia, dokladnie jak mowi manifest:
     * "unclaimed seats return to you, minus fee".
     *
     * TERMINALNE i jednorazowe. Manifest obiecuje, ze wszystkie odpowiedzi
     * otwieraja sie naraz, wiec nie ma czesciowego przyjmowania. To tez powod,
     * dla ktorego nie trzymamy licznika wyplaconych miejsc.
     *
     * Wymaga co najmniej jednego zwyciezcy. Rozstrzygniecie z pusta lista byloby
     * darmowym wyjsciem przed terminem - "nie przyjmuje nikogo, oddajcie kase,
     * oplaty nie place". Kto nie przyjmuje nikogo, idzie sciezka wygasniecia
     * i placi oplate; jego pieniadze czekaja do terminu, ktory sam ustawil.
     *
     * BRAK nonReentrant jest CELOWY: ta funkcja nie wykonuje ANI JEDNEGO
     * wywolania zewnetrznego. Pieniadze nie opuszczaja kontraktu, tylko zmieniaja
     * wlasciciela w ksiedze - nie ma komu oddac sterowania.
     */
    function resolve(bytes32 askId, address[] calldata winners, bytes32[] calldata answerRefs)
        external
    {
        uint256 n = winners.length;
        if (n == 0) revert NoWinners();
        if (n != answerRefs.length) revert LengthMismatch();

        // Autoryzacja przez ODTWORZENIE klucza z msg.sender: brak wpisu == brak
        // uprawnienia. Nie ma osobnego pola wlasciciela do porownywania.
        bytes32 key = keyFor(msg.sender, askId);
        Escrow storage e = escrows[key];

        uint256 seats = e.seats;
        // 0 znaczy albo "nigdy nie finansowany", albo "juz zamkniety". Dla
        // wolajacego to ten sam wynik: nie ma czego rozstrzygac.
        if (seats == 0) revert NotOpen();
        if (n > seats) revert TooManyWinners();
        // Okno laski - patrz RESOLVE_GRACE.
        if (block.timestamp > uint256(e.deadline) + RESOLVE_GRACE) revert ResolveWindowClosed();

        // ==============================================================
        // DOLNA GRANICA CZASU - LUKA KRYTYCZNA, ZNALEZIONA W PRZEGLADZIE
        // ==============================================================
        // Wczesniej sprawdzana byla WYLACZNIE granica gorna. `resolve` dalo sie
        // wolac w dowolnej chwili od sfinansowania - takze w tym samym bloku.
        //
        // Atak, ktory to otwieralo:
        //   1. autor finansuje Aska na 5 miejsc, 10 USDC
        //   2. odpowiadajacy czytaja escrowFor() -> "otwarty, 5 miejsc, 10 USDC"
        //      i zaczynaja pisac. TO JEST CALA ICH OCHRONA.
        //   3. autor czyta naplywajace odpowiedzi poza lancuchem
        //   4. w dowolnej sekundzie wola resolve z JEDNYM zwyciezca (wlasny
        //      drugi portfel) - reszta miejsc wraca do niego, oplaty ZERO,
        //      bo oplate liczyl tylko settleExpired
        //   5. autor ma z powrotem prawie caly budzet, praca wykonana za darmo
        //
        // Regula, ktora to zamyka: PRZED terminem wolno zamknac Aska tylko
        // WYPELNIAJAC KAZDE MIEJSCE. Nic nie wraca do autora, wiec nie ma czego
        // odzyskac wczesniej. Po terminie wolno rozstrzygnac czesciowo - wtedy
        // reszta wraca, ale MINUS OPLATA, dokladnie jak przy wygasnieciu
        // (patrz nizej).
        //
        // Dlaczego nie zakaz calkowity przed terminem: Ask z trzema miejscami,
        // ktory dostal trzy dobre odpowiedzi w godzine, ma prawo zamknac sie od
        // razu. To jest przypadek uczciwy i nikogo nie krzywdzi - wszyscy
        // dostaja swoje.
        bool beforeDeadline = block.timestamp < uint256(e.deadline);
        if (beforeDeadline && n != seats) revert EarlyResolveMustFillSeats();

        uint256 perAnswer = e.perAnswer;

        // Zamkniecie PRZED jakimkolwiek ksiegowaniem. Nawet bez wywolan
        // zewnetrznych trzymamy kolejnosc checks-effects-interactions, zeby
        // dolozenie kiedys transferu do tej funkcji nie otwieralo dziury.
        e.seats = 0;

        for (uint256 i = 0; i < n; ) {
            address w = winners[i];

            // Adres zerowy spalilby miejsce bezpowrotnie - to zawsze blad UI,
            // nigdy intencja.
            if (w == address(0)) revert InvalidWinner();

            // Autor nie placi sam sobie. NIE zamyka to self-dealingu (wystarczy
            // drugi portfel - patrz README), ale zamyka wersje najtansza
            // i najczestsza, i nie ma zadnego uczciwego przypadku, ktory by na
            // tym ucierpial: autor nie odpowiada na wlasnego Aska.
            if (w == msg.sender) revert InvalidWinner();

            // answerRef jest DOWODEM, ktora odpowiedz dostala te wyplate. Pusty
            // ref znaczy brak dowodu, czyli dokladnie to, czego ten produkt
            // obiecuje nie robic.
            if (answerRefs[i] == bytes32(0)) revert MissingAnswerRef();

            // Duplikat sprawdzamy W PAMIECI, a nie mapa na lancuchu. Mapa
            // seatTaken kosztowalaby trwaly zapis na kazdego zwyciezce, a przy
            // TERMINALNYM rozstrzygnieciu byloby to placenie za pamiec, ktorej
            // nikt juz nigdy nie przeczyta. Przy n <= 20 to najwyzej 190
            // porownan w pamieci. Chroni przed UI, ktore wyslalo ten sam adres
            // dwa razy, i przenosi tu regule "jedna odpowiedz na osobe".
            for (uint256 j = 0; j < i; ) {
                if (winners[j] == w) revert DuplicateWinner();
                unchecked { ++j; }
            }

            claimable[w] += perAnswer;
            emit SeatAwarded(key, w, answerRefs[i], perAnswer);

            unchecked { ++i; }
        }

        // Zwrot liczony z POL ASKA, a nie z tego, co "zostalo" na kontrakcie.
        // Dzieki temu odpowiadajacy, ktory nigdy nie odbierze swojego salda,
        // nie blokuje zwrotu autorowi ani o minute.
        uint256 refund = (seats - n) * perAnswer;
        uint256 fee;

        if (refund != 0) {
            // ==========================================================
            // OPLATA TAKZE PRZY ROZSTRZYGNIECIU - DRUGA POLOWA NAPRAWY
            // ==========================================================
            // Wczesniej oplate liczyl WYLACZNIE settleExpired. Skutek: zwrot
            // przez resolve byl zawsze tanszy niz przez wygasniecie, wiec
            // wycofanie pieniedzy z feedu bylo oplacalne, a manifest obiecuje
            // odwrotnie: "unclaimed seats return to you, MINUS FEE".
            //
            // Sama dolna granica czasu tego nie zamykala: po terminie autor
            // dalej moglby rozstrzygnac jednym zwyciezca i odzyskac reszte za
            // darmo, podczas gdy milczenie kosztowaloby go oplate. Placilo sie
            // wiec przyjac jedna odpowiedz zamiast zadnej - i na tym skonczyc.
            //
            // Teraz obie drogi odzyskania pieniedzy kosztuja tyle samo, wiec
            // wybor miedzy nimi przestaje byc decyzja finansowa.
            //
            // Autor dostaje RESZTE, nie druga niezalezna dzielna - dzieki temu
            // suma zawsze schodzi sie do budzetu co do jednostki, niezaleznie
            // od zaokraglenia w dol.
            fee = (refund * FEE_BPS) / 10_000;
            if (fee != 0) {
                claimable[FEE_RECIPIENT] += fee;
            }
            claimable[msg.sender] += refund - fee;
        }

        // totalLiabilities sie NIE ZMIENIA: pieniadze zmienily wlasciciela,
        // a nie ilosc. Suma przypisan to dokladnie seats * perAnswer:
        // n * perAnswer dla zwyciezcow + (refund - fee) dla autora + fee.

        emit AskResolved(key, msg.sender, uint32(n), refund - fee);
    }

    // ------------------------------------------------------------------
    // 3. Wygasniecie
    // ------------------------------------------------------------------

    /**
     * Zamyka Aska, ktorego nikt nie rozstrzygnal: caly budzet wraca do autora
     * minus oplata. To jest "let the deadline pass without resolving and
     * unclaimed seats return to you, minus fee" z manifestu.
     *
     * BEZ UPRAWNIEN - wolac moze ktokolwiek. Adres docelowy jest zaszyty
     * w KLUCZU, wiec wolajacy nie ma czego przekierowac: placi gaz i nie
     * dostaje nic. Dzieki temu autor nie potrzebuje ani gazu, ani zycia, zeby
     * odzyskac srodki, a oplata jest sciagalna nawet wtedy, gdy autor zniknal.
     *
     * BRAK nonReentrant jest CELOWY - jak w resolve(), zero wywolan zewnetrznych.
     */
    function settleExpired(address author, bytes32 askId) external {
        bytes32 key = keyFor(author, askId);
        Escrow storage e = escrows[key];

        uint256 seats = e.seats;
        if (seats == 0) revert NotOpen();

        // Okna resolve i settleExpired sa ROZLACZNE - nie istnieje moment,
        // w ktorym obie sciezki sa otwarte, wiec kolejnosc transakcji nie ma
        // dla nikogo wartosci i nie ma czego frontrunowac.
        if (block.timestamp <= uint256(e.deadline) + RESOLVE_GRACE) revert TooEarly();

        uint256 budget = seats * uint256(e.perAnswer);
        e.seats = 0;

        // Jedyne dzielenie w calym kontrakcie. Autor dostaje RESZTE, a nie druga
        // niezalezna dzielna - dzieki temu obie nogi sumuja sie do budzetu co do
        // jednostki, niezaleznie od zaokraglenia w dol przy oplacie.
        uint256 fee = (budget * FEE_BPS) / 10_000;
        uint256 toAuthor = budget - fee;

        if (fee != 0) {
            claimable[FEE_RECIPIENT] += fee;
        }
        claimable[author] += toAuthor;

        // totalLiabilities bez zmian - jak w resolve(), zmienia sie wlasciciel.

        emit AskExpired(key, author, toAuthor, fee);
    }

    // ------------------------------------------------------------------
    // 4. Odbior
    // ------------------------------------------------------------------

    /** Odbior wlasnego salda. Podloga bezpieczenstwa: dziala bez niczyjej pomocy. */
    function claim() external {
        _payout(msg.sender);
    }

    /**
     * TA FUNKCJA ODZYSKUJE OBIETNICE "natychmiast".
     *
     * Ktokolwiek moze zaplacic gaz za dostarczenie CUDZEGO salda, ale kierunek
     * przelewu jest zaszyty w kodzie: tokeny ida do `account`, nigdy do
     * msg.sender. Aplikacja wola to zaraz po resolve, wiec w praktyce
     * odpowiadajacy dostaje przelew, nic nie robiac.
     *
     * A jesli relayer padnie, jesli odpowiadajacy nie ma ETH na gaz albo jest
     * na czarnej liscie USDC - pieniadze i tak sa jego i czekaja bez terminu
     * waznosci. Pull to podloga, push-na-czyjas-rzecz to domyslny UX.
     *
     * Kazde wywolanie jest OSOBNA transakcja, wiec jeden zablokowany odbiorca
     * nie przewraca dostawy dla pozostalych.
     */
    function claimFor(address account) external {
        _payout(account);
    }

    /**
     * JEDYNE miejsce w kontrakcie, ktore wysyla tokeny. Jeden punkt wyjscia
     * znaczy jedno miejsce do zaudytowania.
     */
    function _payout(address account) private nonReentrant {
        uint256 amount = claimable[account];
        // Rewert zamiast cichego przejscia: pusta transakcja wygladalaby
        // w historii jak wyplata, ktora sie odbyla.
        if (amount == 0) revert NothingToClaim();

        // Effects przed interaction. Ponowne wejscie zastanie tu zero.
        claimable[account] = 0;
        totalLiabilities -= amount;

        emit Claimed(account, amount, msg.sender);

        _safeTransfer(account, amount);
    }

    // ------------------------------------------------------------------
    // Bezpieczne wywolania tokena
    // ------------------------------------------------------------------

    /**
     * USDC i wiele innych tokenow nie zwraca wartosci zgodnie z ERC-20 - proxy
     * USDC zwraca bool, ale kod, ktory zaklada to na sztywno przez interfejs,
     * wywala sie na implementacjach zwracajacych nic. Dlatego wywolanie jest
     * niskopoziomowe, a wynik akceptowany, gdy:
     *   - wywolanie sie powiodlo, ORAZ
     *   - nic nie zwrocono (stare tokeny) ALBO zwrocono dokladnie `true`.
     *
     * Sprawdzenia `code.length` tutaj NIE MA, bo TOKEN jest immutable
     * i sprawdzony raz w konstruktorze - powtarzanie tego przy kazdym transferze
     * to placenie za ten sam fakt N razy.
     */
    function _call(bytes memory data) private {
        (bool ok, bytes memory ret) = TOKEN.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _safeTransfer(address to, uint256 amount) private {
        _call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        _call(abi.encodeCall(IERC20Minimal.transferFrom, (from, to, amount)));
    }
}
