// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

// Internal contracts
import "./LetoPriceConsumer.sol";

// Interfaces
import "./interfaces/ILetoLendingAdapter.sol";
import "./interfaces/ILetoStrategyAdapter.sol";
import "./interfaces/ILetoExchangeAdapter.sol";
import "./interfaces/ILetoRegistry.sol";
import "./interfaces/ILetoToken.sol";
import "./interfaces/IStableDebtToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract LetoPool is LetoPriceConsumer {

	uint256 MAX_INT = 2**256 - 1;

	struct Parameters {
		address asset0;
		address asset1;
		string  name;
		string  symbol;
		uint16  target_leverage;
		uint256 rate;
		address lending_market_adapter;
		address exchange_adapter;
		address token;
	}

	address private _deployer;
	address public _priceFeed;
	uint256 private _initial_pair_price;

	ILetoStrategyAdapter private _strategy;
	ILetoRegistry        private _registry;
	Parameters           private _parameters;
	ILetoToken           private _token;

	constructor(
		address       strategy_,
		address       registry_,
		address       pool_token_,
		address       asset0_,
		address       asset1_,
		uint16        target_leverage_,
		uint256       pool_token_price_,
		address       lending_market_adapter_,
		address       exchange_adapter_
	) {
		require(strategy_ != address(0),               "LetoPool: strategy_ cannot be the zero address");
		require(registry_ != address(0),               "LetoPool: registry_ cannot be the zero address");
		require(pool_token_ != address(0),             "LetoPool: pool_token_ cannot be the zero address");
		require(asset0_ != address(0),                 "LetoPool: asset0_ cannot be the zero address");
		require(asset1_ != address(0),                 "LetoPool: asset1_ cannot be the zero address");
		require(target_leverage_ > 0,                  "LetoPool: target_leverage_ cannot be less then or equal to zero");
		require(pool_token_price_ > 0,                  "LetoPool: pool_token_price_ cannot be less then or equal to zero");
		require(lending_market_adapter_ != address(0), "LetoPool: lending_market_adapter_ cannot be the zero address");
		require(exchange_adapter_ != address(0),       "LetoPool: exchange_adapter_ cannot be the zero address");

		_strategy = ILetoStrategyAdapter(strategy_);
		_registry = ILetoRegistry(registry_);
		_token = ILetoToken(pool_token_);

		_deployer = msg.sender;

		_parameters = Parameters({
			name:                   _token.name(),
			symbol:                 _token.symbol(),
			asset0:                 asset0_,
			asset1:                 asset1_,
			target_leverage:        target_leverage_,
			rate:                   pool_token_price_,
			lending_market_adapter: lending_market_adapter_,
			exchange_adapter:       exchange_adapter_,
			token:                  pool_token_
		});

		_priceFeed = _registry.getAddress(string(abi.encodePacked("PriceFeed:", _token.symbol())));
		_initial_pair_price = latestPairPrice();

		IERC20(asset0_).approve(exchange_adapter_, MAX_INT);
		IERC20(asset1_).approve(exchange_adapter_, MAX_INT);
		IERC20(asset0_).approve(lending_market_adapter_, MAX_INT);
		IERC20(asset1_).approve(lending_market_adapter_, MAX_INT);
	}

	// Getters

	function latestPairPrice() public view returns (uint256) {
		return uint256(getPrice(_priceFeed));
	}

	function pairPriceDecimals() public view returns (uint256) {
		return uint256(getPriceDecimals(_priceFeed));
	}

	function initialPairPrice() public view returns (uint256) {
		return _initial_pair_price;
	}

	function rate() public view returns (uint256) {
		return _strategy.rate(address(this));
	}

	function initialRate() public view returns (uint256) {
		return _parameters.rate;
	}

	function asset0() public view returns (address) {
		return _parameters.asset0;
	}

	function asset1() public view returns (address) {
		return _parameters.asset1;
	}

	function targetLeverage() public view returns (uint16) {
		return _parameters.target_leverage;
	}

	function parameters() public view returns (Parameters memory) {
		return _parameters;
	}

	function strategy() public view returns (address) {
		return address(_strategy);
	}

	function token() public view returns (address) {
		return address(_token);
	}

	function exchangeAdapter() public view returns (ILetoExchangeAdapter) {
		return ILetoExchangeAdapter(_parameters.exchange_adapter);
	}

	function lendingAdapter() public view returns (ILetoLendingAdapter) {
		return ILetoLendingAdapter(_parameters.lending_market_adapter);
	}

	function calculateMaxWithdrawal() public view returns (uint256) {
		return _strategy.calculateMaxWithdrawal(address(this));
	}


	function state() external view returns (ILetoStrategyAdapter.PoolState memory) {
		return _strategy.poolState(address(this));
	}

	// State changing

	event Repay(address asset, uint256 amount);

	function repay(address asset_, uint256 amount) onlyStrategy external {
		lendingAdapter().repay(asset_, amount);
		emit Borrow(asset_, amount);
	}

	event Borrow(address asset, uint256 amount);

	function borrow(address asset, uint256 amount) onlyStrategy external {
		(bool success,) = address(lendingAdapter()).delegatecall(
			abi.encodeWithSignature("borrow(address,address,uint256)", lendingAdapter().lendingPool(), asset, amount)
		);

		require(success, "LetoPool: call borrow failed");

		emit Borrow(asset, amount);
	}

	event DepositToLendingPool(address asset, uint256 amount);

	function depositToLendingPool(address asset, uint256 amount) onlyStrategy external {
		lendingAdapter().deposit(asset, amount);
		emit DepositToLendingPool(asset, amount);
	}

	event WithdrawFromLendingPool(address asset, uint256 amount);

	function withdrawCall(address asset, uint256 amount) internal {
		(bool success,) = address(lendingAdapter()).delegatecall(
			abi.encodeWithSignature("withdraw(address,address,uint256)", lendingAdapter().lendingPool(), asset, amount)
		);

		require(success, "LetoPool: call withdraw failed");

		emit WithdrawFromLendingPool(asset, amount);
	}

	function withdraw(address asset, uint256 amount) onlyStrategy external {
		withdrawCall(asset, amount);
	}

	event SwapThroughAdapter(address asset0, address asset1, uint256 amountIn, uint256 amountOut);

	function swap(address assetIn, address assetOut, uint256 amountIn, uint256 amountOutMin) onlyStrategy external returns (uint256 amountOut) {
		amountOut = exchangeAdapter().swap(assetIn, assetOut, amountIn, amountOutMin);
		emit SwapThroughAdapter(assetIn, assetOut, amountIn, amountOut);
	}

	// Public state changing methods

	event Deposit(address depositer, uint256 amountIn, uint256 amountOut);

	function deposit(uint256 amountIn) external returns (uint256 amountOut) {
		IERC20 asset0_ = IERC20(asset0());

		require(amountIn > 0, "LetoPool: amount is less then zero");
		require(asset0_.balanceOf(msg.sender) >= amountIn, "LetoPool: insufficient balance");
		require(asset0_.allowance(msg.sender, address(this)) >= amountIn, "LetoPool: not approved to transfer");

		amountOut = rate() * amountIn;

		asset0_.transferFrom(msg.sender, address(this), amountIn);
		_token.mint(msg.sender, amountOut);

		emit Deposit(msg.sender, amountIn, amountOut);
	}

	event Withdrawal(address depositer, uint256 amountIn, uint256 amountOut);

	function redeem(uint256 amountIn) external returns (uint256 amountOut) {
		IERC20 asset0_ = IERC20(asset0());
		ILetoToken pool_token = ILetoToken(token());

		require(amountIn > 0, "LetoPool: the amount can`t be equal to zero");
		require(pool_token.balanceOf(msg.sender) >= amountIn, "LetoPool: insufficient balance");
		require(_token.allowance(msg.sender, address(this)) >= amountIn, "LetoPool: not approved to transfer");

		amountOut = amountIn / rate();

		require(amountOut <= calculateMaxWithdrawal(), "LetoPool: withdrawal exceeds the maximum possible");

		withdrawCall(asset0(), amountOut);

		pool_token.burn(msg.sender, amountIn);
		asset0_.transfer(msg.sender, amountOut);

		emit Withdrawal(msg.sender, amountIn, amountOut);
	}

	// Modifiers

	modifier onlyStrategy() {
		require(msg.sender == address(_strategy), "LetoPool: call is available only for strategy");
		_;
	}
}
