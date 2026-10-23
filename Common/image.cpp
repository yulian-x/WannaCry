#include "image.h"

#include <wincodec.h>
#include <wrl/client.h>

#include <vector>

#pragma comment( lib, "windowscodecs.lib" )

using Microsoft::WRL::ComPtr;

namespace
{
    [[nodiscard]] bool decode( const void* data, std::size_t size, std::vector< std::uint8_t >& pixels, UINT& width, UINT& height )
    {
        const HRESULT com = ::CoInitializeEx( nullptr, COINIT_MULTITHREADED );
        bool decoded = false;
        {
            ComPtr< IWICImagingFactory > factory;
            ComPtr< IWICStream > stream;
            ComPtr< IWICBitmapDecoder > decoder;
            ComPtr< IWICBitmapFrameDecode > frame;
            ComPtr< IWICFormatConverter > converter;
            decoded = SUCCEEDED( ::CoCreateInstance( CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS( factory.GetAddressOf( ) ) ) ) &&
                      SUCCEEDED( factory->CreateStream( stream.GetAddressOf( ) ) ) &&
                      SUCCEEDED( stream->InitializeFromMemory( static_cast< BYTE* >( const_cast< void* >( data ) ), static_cast< DWORD >( size ) ) ) &&
                      SUCCEEDED( factory->CreateDecoderFromStream( stream.Get( ), nullptr, WICDecodeMetadataCacheOnDemand, decoder.GetAddressOf( ) ) ) &&
                      SUCCEEDED( decoder->GetFrame( 0, frame.GetAddressOf( ) ) ) &&
                      SUCCEEDED( factory->CreateFormatConverter( converter.GetAddressOf( ) ) ) &&
                      SUCCEEDED( converter->Initialize( frame.Get( ), GUID_WICPixelFormat32bppRGBA, WICBitmapDitherTypeNone, nullptr, 0.0, WICBitmapPaletteTypeCustom ) ) &&
                      SUCCEEDED( converter->GetSize( &width, &height ) ) && width > 0 && height > 0;
            if ( decoded )
            {
                pixels.resize( static_cast< std::size_t >( width ) * height * 4 );
                decoded = SUCCEEDED( converter->CopyPixels( nullptr, width * 4, static_cast< UINT >( pixels.size( ) ), pixels.data( ) ) );
            }
        }
        if ( SUCCEEDED( com ) )
            ::CoUninitialize( );
        return decoded;
    }
}

bool c_image::load( ID3D11Device* device, const void* data, std::size_t size )
{
    if ( !device || !data || size == 0 )
        return false;
    std::vector< std::uint8_t > pixels;
    UINT width = 0;
    UINT height = 0;
    if ( !decode( data, size, pixels, width, height ) )
        return false;

    D3D11_TEXTURE2D_DESC description{ };
    description.Width = width;
    description.Height = height;
    description.MipLevels = 0;
    description.ArraySize = 1;
    description.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    description.SampleDesc.Count = 1;
    description.Usage = D3D11_USAGE_DEFAULT;
    description.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
    description.MiscFlags = D3D11_RESOURCE_MISC_GENERATE_MIPS;

    ComPtr< ID3D11Texture2D > texture;
    ComPtr< ID3D11ShaderResourceView > view;
    ComPtr< ID3D11DeviceContext > context;
    if ( FAILED( device->CreateTexture2D( &description, nullptr, texture.GetAddressOf( ) ) ) ||
         FAILED( device->CreateShaderResourceView( texture.Get( ), nullptr, view.GetAddressOf( ) ) ) )
        return false;
    device->GetImmediateContext( context.GetAddressOf( ) );
    context->UpdateSubresource( texture.Get( ), 0, nullptr, pixels.data( ), width * 4, 0 );
    context->GenerateMips( view.Get( ) );

    release( );
    view_ = view.Detach( );
    size_ = ImVec2{ static_cast< float >( width ), static_cast< float >( height ) };
    return true;
}

void c_image::release( ) noexcept
{
    if ( view_ )
    {
        view_->Release( );
        view_ = nullptr;
    }
    size_ = ImVec2{ };
}
