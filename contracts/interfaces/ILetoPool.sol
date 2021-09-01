pragma solidity 0.8.4;

import "./ILetoLendingAdapter.sol";
import "./ILetoExchangeAdapter.sol";

interface ILetoPool {
	struct Parameters {
		address asset0;
		address asset1;
		string  name;
		string  symbol;
		uint16  target_leverage;
		uint256 rate;
		address lending_market_adapter;
		address exchange_adapter;
	}

	function exchangeAdapter() external view returns (ILetoExchangeAdapter);
	function lendingAdapter() external view returns (ILetoLendingAdapter);
	function parameters() external view returns (Parameters memory);
	function pairPriceDecimals() external view returns (uint256);
	function initialPairPrice() external view returns (uint256);
	function asset0() external view returns (address);
	function asset1() external view returns (address);
	function targetLeverage() external view returns (uint16);
	function rate() external view returns (uint256);
	function initialRate() external view returns (uint256);
	function latestPairPrice() external view returns (uint256);
	function strategy() external view returns (address);
	function token() external view returns (address);

	function borrow(address asset, uint256 amount) external;
	function repay(address asset, uint256 amount) external;
	function depositToLendingPool(address asset, uint256 amount) external;

	function deposit(uint256 amount) external returns (uint256);
	function withdrawal(uint256 amount) external returns (uint256);
	function swap(address assetIn, address assetOut, uint256 amountIn, uint256 amountOut) external returns (uint256);
}