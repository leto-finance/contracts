// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./../interfaces/ILetoRegistry.sol";

contract LetoUniswapAdapter {
	ILetoRegistry public registry;
	ISwapRouter public router;

	constructor(address leto_registry_) {
		registry = ILetoRegistry(leto_registry_);
		router = ISwapRouter(registry.getAddress("Uniswap:Router"));
	}

	event Swap(address assetIn, address assetOut, uint256 amountIn, uint256 amountOut);

	function swap(address assetIn, address assetOut, uint256 amountIn, uint256 amountOutMinimum) external returns (uint256 amountOut) {
		IERC20(assetIn).transferFrom(msg.sender, address(this), amountIn);
		IERC20(assetIn).approve(address(router), amountIn);

		amountOut = router.exactInputSingle(
			ISwapRouter.ExactInputSingleParams({
				tokenIn: assetIn,
				tokenOut: assetOut,
				fee: 3000,
				recipient: msg.sender,
				deadline: block.timestamp + 1000,
				amountIn: amountIn,
				amountOutMinimum: amountOutMinimum,
				sqrtPriceLimitX96: 0
			})
		);

		emit Swap(assetIn, assetOut, amountIn, amountOut);
	}
}