pragma solidity 0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LetoPool.sol";

// Interfaces
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ILetoRegistry.sol";

contract LetoDeployer is Ownable {
	address private _leto_registry;

	constructor(address leto_registry_) {
		_leto_registry = leto_registry_;
	}

	function deployPool(
		address strategy_,
		address pool_token_,
		address asset0_,
		address asset1_,
		uint8   target_leverage_,
		uint256 pool_token_price_,
		string memory bid_token_symbol_,
		address lending_market_adapter_,
		address exchange_adapter_,
		uint256 amount_
	)
		public onlyOwner returns (LetoPool)
	{
		Ownable ownableToken = Ownable(pool_token_);
		require(ownableToken.owner() == address(this), "LetoDeployer: deployer must be owner of pool token");

		LetoPool pool = new LetoPool(
			strategy_,
			_leto_registry,
			pool_token_,
			asset0_,
			asset1_,
			target_leverage_,
			pool_token_price_,
			bid_token_symbol_,
			lending_market_adapter_,
			exchange_adapter_
		);

		IERC20(ILetoRegistry(_leto_registry).getAddress(bid_token_symbol_)).approve(address(pool), amount_);

		ownableToken.transferOwnership(address(pool));
		uint256 pool_token_amount = pool.deposit(amount_);

		IERC20(pool_token_).transfer(address(msg.sender), pool_token_amount);

		return pool;
	}
}