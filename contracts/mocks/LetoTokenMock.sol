pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LetoTokenMock is ERC20, Ownable {

	uint8 private _decimals;

	constructor (string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
		_decimals = decimals_;
	}

	function decimals() public view virtual override returns (uint8) {
			return _decimals;
	}

	function mint(address account, uint256 amount) external {
		_mint(account, amount);
	}
}