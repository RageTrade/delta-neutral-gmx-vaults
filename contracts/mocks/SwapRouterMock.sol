// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { ISwapRouter } from '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract SwapRouterMock {
    /// @dev The length of the bytes encoded address
    uint256 private constant ADDR_SIZE = 20;
    /// @dev The length of the bytes encoded fee
    uint256 private constant FEE_SIZE = 3;

    /// @dev The offset of a single token address and pool fee
    uint256 private constant NEXT_OFFSET = ADDR_SIZE + FEE_SIZE;

    function toAddress(bytes memory _bytes, uint256 _start) internal pure returns (address) {
        require(_start + 20 >= _start, 'toAddress_overflow');
        require(_bytes.length >= _start + 20, 'toAddress_outOfBounds');
        address tempAddress;

        assembly {
            tempAddress := div(mload(add(add(_bytes, 0x20), _start)), 0x1000000000000000000000000)
        }

        return tempAddress;
    }

    function exactOutputSingle(ISwapRouter.ExactOutputSingleParams calldata params)
        external
        returns (uint256 amountIn)
    {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountInMaximum);
        IERC20(params.tokenOut).transfer(msg.sender, params.amountOut);
        return params.amountInMaximum;
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params) external returns (uint256 amountOut) {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).transfer(msg.sender, params.amountOutMinimum);
        return params.amountOutMinimum;
    }

    function exactOutput(ISwapRouter.ExactOutputParams calldata params) external returns (uint256 amountIn) {
        address from = toAddress(params.path, 0);
        address to = toAddress(params.path, ADDR_SIZE + FEE_SIZE + ADDR_SIZE);

        IERC20(from).transferFrom(msg.sender, address(this), params.amountInMaximum);
        IERC20(to).transfer(msg.sender, params.amountOut);
        return params.amountInMaximum;
    }

    function exactInput(ISwapRouter.ExactInputParams calldata params) external returns (uint256 amountOut) {
        address from = toAddress(params.path, 0);
        address to = toAddress(params.path, ADDR_SIZE + FEE_SIZE + ADDR_SIZE);

        IERC20(from).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(to).transfer(msg.sender, params.amountOutMinimum);
        return params.amountOutMinimum;
    }
}
