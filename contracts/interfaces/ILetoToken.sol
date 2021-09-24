// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ILetoToken is IERC20, IERC20Metadata {
	function burn(address account, uint256 amount) external;
	function mint(address account, uint256 amount) external;
}