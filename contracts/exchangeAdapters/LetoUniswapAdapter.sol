pragma solidity 0.8.4;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "./../interfaces/ILetoToken.sol";

contract LetoUniswapAdapter {
	// FIXME: get this address from registry
	ISwapRouter public router = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

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