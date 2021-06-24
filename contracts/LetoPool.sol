pragma solidity 0.8.4;

// Internal contracts
import "./LetoPriceConsumer.sol";

// Interfaces
import "./interfaces/ILetoLendingAdapter.sol";
import "./interfaces/ILetoStrategyAdapter.sol";
import "./interfaces/ILetoExchangeAdapter.sol";
import "./interfaces/ILetoRegistry.sol";
import "./interfaces/ILetoToken.sol";

contract LetoPool is LetoPriceConsumer {

	uint256 MAX_INT = 2**256 - 1;

	enum State { RebalancingRequired, Balanced, Rebalancing }

	struct Parameters {
		address asset0;
		address asset1;
		string  name;
		string  symbol;
		uint8   target_leverage;
		uint256 pool_token_price;
		string  bid_token_symbol;
		address lending_market_adapter;
		address exchange_adapter;
	}

	address private _deployer;
	address public _priceFeed;
	int256 private _initial_pair_price;

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
		uint8         target_leverage_,
		uint256       pool_token_price_,
		string memory bid_token_symbol_,
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
			pool_token_price:       pool_token_price_,
			bid_token_symbol:       bid_token_symbol_,
			lending_market_adapter: lending_market_adapter_,
			exchange_adapter:       exchange_adapter_
		});

		_priceFeed = _registry.getAddress(
			string(
				abi.encodePacked(
					"PriceFeed:",
					ILetoToken(asset0_).symbol(),
					"/",
					ILetoToken(asset1_).symbol()
				)
			)
		);

		_initial_pair_price = latestPairPrice();

		// FIXME: get this address from registry
		ILetoToken(0x030bA81f1c18d280636F32af80b9AAd02Cf0854e).approve(lending_market_adapter_, MAX_INT); // aWETH
		ILetoToken(asset0_).approve(exchange_adapter_, MAX_INT);
		ILetoToken(asset1_).approve(exchange_adapter_, MAX_INT);
		ILetoToken(asset0_).approve(lending_market_adapter_, MAX_INT);
		ILetoToken(asset1_).approve(lending_market_adapter_, MAX_INT);
	}

	// Getters

	function latestPairPrice() public view returns (int256) {
		return getPrice(_priceFeed);
	}

	function initialPairPrice() public view returns (int256) {
		return _initial_pair_price;
	}

	function price() public view returns (uint256) {
		return _strategy.price(address(this));
	}

	function bidTokenSymbol() public view returns (string memory) {
		return _parameters.bid_token_symbol;
	}

	function poolTokenInitialPrice() public view returns (uint256) {
		return _parameters.pool_token_price;
	}

	function asset0() public view returns (address) {
		return _parameters.asset0;
	}

	function asset1() public view returns (address) {
		return _parameters.asset1;
	}

	function targetLeverage() public view returns (uint256) {
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

	function bidToken() public view returns (address) {
		return _registry.getAddress(bidTokenSymbol());
	}

	function exchangeAdapter() public view returns (ILetoExchangeAdapter) {
		return ILetoExchangeAdapter(_parameters.exchange_adapter);
	}

	function lendingAdapter() public view returns (ILetoLendingAdapter) {
		return ILetoLendingAdapter(_parameters.lending_market_adapter);
	}

	// State changing

	function borrow(address asset, uint256 amount) external {
		lendingAdapter().borrow(asset, amount, _parameters.lending_market_adapter);
	}

	event DepositToLendingPool(address asset, uint256 amount);

	function depositToLendingPool(address asset, uint256 amount) external {
		lendingAdapter().deposit(asset, amount, _parameters.lending_market_adapter);
		emit DepositToLendingPool(asset, amount);
	}

	event SwapThroughAdapter(address asset0, address asset1, uint256 amountIn, uint256 amountOut);

	function swap(address assetIn, address assetOut, uint256 amountIn, uint256 amountOutMin) external returns (uint256 amountOut) {
		amountOut = exchangeAdapter().swap(assetIn, assetOut, amountIn, amountOutMin);
		emit SwapThroughAdapter(assetIn, assetOut, amountIn, amountOut);
	}

	event Deposit(address depositer, uint256 amount, uint256 amountIn, uint256 amountOut);

	function deposit(uint256 amount_) external returns (uint256) {
		ILetoToken bid_token = ILetoToken(bidToken());

		require(amount_ > 0, "LetoPool: amount is less then zero");
		require(bid_token.balanceOf(msg.sender) >= amount_, "LetoPool: insufficient balance");
		require(bid_token.allowance(msg.sender, address(this)) >= amount_, "LetoPool: not allowance to spend");

		(uint256 bid_token_amount, uint256 pool_token_amount) = tokenExchangeValues(bidToken(), token(), amount_, price());

		bid_token.transferFrom(msg.sender, address(this), bid_token_amount);
		_token.mint(msg.sender, pool_token_amount);

		emit Deposit(msg.sender, amount_, bid_token_amount, pool_token_amount);

		return pool_token_amount;
	}

	event Withdrawal(address depositer, uint256 amount, uint256 amountIn, uint256 amountOut);

	function withdrawal(uint256 amount_) external returns (uint256) {
		ILetoToken bid_token = ILetoToken(bidToken());
		ILetoToken pool_token = ILetoToken(token());

		require(amount_ > 0, "LetoPool: amount is less then zero");
		require(_token.allowance(msg.sender, address(this)) >= amount_, "LetoPool: insufficient balance");

		uint256 price_ = (10 ** bid_token.decimals() * 10 ** pool_token.decimals()) / price();

		(uint256 pool_token_amount, uint256 bid_token_amount) = tokenExchangeValues(token(), bidToken(), amount_, price_);

		require(bid_token.balanceOf(address(this)) >= bid_token_amount, "LetoPool: balance of the pool is less than the amount for withdrawal");

		_token.transferFrom(msg.sender, address(this), pool_token_amount);
		bid_token.transfer(msg.sender, bid_token_amount);

		emit Withdrawal(msg.sender, amount_, pool_token_amount, bid_token_amount);

		return bid_token_amount;
	}

	// Internals

	function tokenExchangeValues(
		address tokenA_, address tokenB_,
		uint256 amountA_, uint256 price_
	)
		public
		view
		returns (uint256 amountA, uint256 amountB)
	{
		ILetoToken token_a = ILetoToken(tokenA_);
		uint256 token_a_decimals = token_a.decimals();

		ILetoToken token_b = ILetoToken(tokenB_);
		uint256 token_b_decimals = token_b.decimals();

		amountA = amountA_;

		if (token_a_decimals > token_b_decimals) {
			amountA = amountA_ - (amountA_ % (10 ** token_b_decimals));
		}

		amountB = (amountA * (10 ** token_b_decimals)) / price_;
	}
}
