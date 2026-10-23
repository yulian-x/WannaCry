#pragma once

#ifndef IMGUI_DEFINE_MATH_OPERATORS
#define IMGUI_DEFINE_MATH_OPERATORS
#endif

#include <Windows.h>
#include <d3d11.h>
#include <dxgi.h>

#include <imgui.h>
#include <imgui_internal.h>

#include "blur.h"
#include "image.h"

namespace lazyui
{
    struct app_context
    {
        HWND window = nullptr;
        ID3D11Device* device = nullptr;
        ID3D11DeviceContext* device_context = nullptr;
        IDXGISwapChain* swap_chain = nullptr;
    };

    inline app_context app{ };
}