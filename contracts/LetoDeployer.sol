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
		uint16  target_leverage_,
		uint256 rate_,
		address lending_market_adapter_,
		address exchange_adapter_,
		uint256 amount_
	)
		public onlyOwner returns (LetoPool)
	{
		Ownable ownable_token = Ownable(pool_token_);
		require(ownable_token.owner() == address(this), "LetoDeployer: deployer must be owner of pool token");

		LetoPool pool = new LetoPool(
			strategy_,
			_leto_registry,
			pool_token_,
			asset0_,
			asset1_,
			target_leverage_,
			rate_,
			lending_market_adapter_,
			exchange_adapter_
		);

		IERC20(asset0_).approve(address(pool), amount_);

		ownable_token.transferOwnership(address(pool));
		IERC20(pool_token_).transfer(address(msg.sender), pool.deposit(amount_));

		return pool;
	}
}