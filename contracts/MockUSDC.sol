// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Token testowy - WYLACZNIE do testow lokalnych AskEscrow.
 *
 * NIE WDRAZAC. Ma `mint` otwarty dla kazdego i zero zabezpieczen; istnieje po
 * to, zeby testy nie musialy forkowac mainnetu ani czekac na siec.
 *
 * Odwzorowuje USDC w jednej rzeczy, ktora ma znaczenie dla escrow: SZESC
 * miejsc dziesietnych, nie osiemnascie. Test na tokenie z 18 miejscami
 * przepuscilby blad mnoznika o bilion.
 */
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
