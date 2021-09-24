// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LetoToken is ERC20, Ownable {

	uint8 private _decimals;
	constructor (string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
		_decimals = decimals_;
	}

	function decimals() public view virtual override returns (uint8) {
		return _decimals;
	}

	function mint(address account, uint256 amount) external onlyOwner {
		_mint(account, amount);
	}

	function burn(address account, uint256 amount) external onlyOwner {
		_burn(account, amount);
	}
}