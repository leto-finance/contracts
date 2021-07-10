pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "./../interfaces/ILetoToken.sol";
import "./../interfaces/ILetoRegistry.sol";

contract LetoUniswapAdapter {
	ILetoRegistry public registry;
	ISwapRouter public router;

	constructor(address leto_registry_) {
		registry = ILetoRegistry(leto_registry_);
		router = ISwapRouter(registry.getAddress("Uniswap:Router"));
	}

	event Swap(address asset0, address asset1, uint256 amountIn, uint256 amountOut);

	function swap(address asset0, address asset1, uint256 amountIn, uint256 amountOutMinimum) external returns (uint256 amountOut) {
		ILetoToken(asset0).transferFrom(msg.sender, address(this), amountIn);
		ILetoToken(asset0).approve(address(router), amountIn);

		amountOut = router.exactInputSingle(
			ISwapRouter.ExactInputSingleParams({
				tokenIn: asset0,
				tokenOut: asset1,
				fee: 3000,
				recipient: msg.sender,
				deadline: block.timestamp + 1000,
				amountIn: amountIn,
				amountOutMinimum: amountOutMinimum,
				sqrtPriceLimitX96: 0
			})
		);

		emit Swap(asset0, asset1, amountIn, amountOut);
	}
}