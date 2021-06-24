pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILetoToken is IERC20 {
	function mint(address account, uint256 amount) external;
	function decimals() external view returns (uint8);
	function name() external view returns (string memory);
	function symbol() external view returns (string memory);
}