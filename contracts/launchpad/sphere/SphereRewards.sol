// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * SphereRewards - PASYWNY PULL-HUB dla strumienia SPHERE (faza 0/1).
 *
 * ===========================================================================
 * ROLA
 * ===========================================================================
 * Wpisany jako jeden z odbiorcow `_feeReceivers` przy launchu SPHERE (i przy
 * kazdym opt-in launchu "Sphere-aligned"), zbiera swoja czesc ETH-owej dzialki
 * tworcy z krzywej. NIE forwarduje niczego samodzielnie - akumuluje, a
 * uprawniony `CONSUMER` (kontrakt stakingu/buybacku albo Safe - decyzja #12
 * w docs/SPHERE-TOKENOMIKA.md) POBIERA srodki przez `pull`.
 *
 * Adres tego kontraktu mrozi sie w konfiguracji launchu SPHERE NA ZAWSZE
 * (salda `claimable` launchpada nie maja clawbacku), wiec musi byc FINALNY
 * przed launchem. Stad brak jakiegokolwiek admina.
 *
 * ===========================================================================
 * DLACZEGO KSIEGOWANIE PO SALDZIE, A NIE PO WLASNEJ KSIEDZE
 * ===========================================================================
 * `receive()` celowo NIE zapisuje stanu. Dwa powody:
 *
 *  1. Dzieki temu wplata przez `.transfer`/`.send` (limit 2300 gazu) przechodzi
 *     - gdyby `receive()` robil SSTORE, kazda taka wplata by rewertowala.
 *     Prawdziwi platnicy (launchpad/hook/vault) i tak placa przez `call` z
 *     pelnym gazem, ale hub ma byc odporny na oba sposoby.
 *  2. Hub ma JEDNEGO konsumenta i ZERO ksiegowosci udzialow. Nie ma tu
 *     `claimable[user]` ani `totalLiabilities`, ktore forced-ETH (selfdestruct)
 *     moglby rozjechac - jak w launchpadzie. Cale saldo nalezy do konsumenta;
 *     donacja (takze wymuszona) po prostu POWIEKSZA to, co konsument moze
 *     wyciagnac. Nie ma wiec niezmiennika do zlamania - `pullable()` to
 *     dokladnie `address(this).balance`.
 *
 * `totalPulled` istnieje WYLACZNIE do obserwowalnosci (dashboard), nie do
 * kontroli - `pull` sprawdza sie o biezace saldo, nie o roznice ksiegowa.
 */
contract SphereRewards {
    /**
     * Jedyny adres, ktory moze wyciagnac ETH. Immutable - kierunek poboru jest
     * zamrozony przy wdrozeniu. Moze byc Safe, timelock z wetem guardiana, albo
     * adres stakingu precommitowany przez CREATE2 (trzy warianty decyzji #12) -
     * z perspektywy huba to jeden nieruchomy adres uprawnionego.
     */
    address public immutable CONSUMER;

    /** Suma dotad wyciagnieta - tylko do wgladu, nie do rozliczen. */
    uint256 public totalPulled;

    event Pulled(address indexed to, uint256 amount, address indexed caller);

    error ZeroAddress();
    error NotConsumer();
    error NothingToPull();
    error EthTransferFailed();

    constructor(address consumer_) {
        if (consumer_ == address(0)) revert ZeroAddress();
        CONSUMER = consumer_;
    }

    /** Czysty akumulator - zaden zapis stanu, patrz naglowek. */
    receive() external payable {}

    /** Ile konsument moze teraz wyciagnac. */
    function pullable() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * Konsument wyciaga `amount` ETH na adres `to`. Kierunek nie jest zaszyty
     * (konsument wskazuje `to`), ale prawo do wywolania - tak: tylko CONSUMER.
     *
     * CEI: `totalPulled` rosnie PRZED wyplata, a limit sprawdza sie o biezace
     * saldo, wiec wejscie powrotne konsumenta (jego wlasny wybor) widzi saldo
     * juz pomniejszone - nie ma jak wyciagnac wiecej niz jest.
     */
    function pull(address to, uint256 amount) external {
        if (msg.sender != CONSUMER) revert NotConsumer();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > address(this).balance) revert NothingToPull();

        totalPulled += amount;
        emit Pulled(to, amount, msg.sender);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }
}
