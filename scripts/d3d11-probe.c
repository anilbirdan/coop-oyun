/* A small real Direct3D 11 readback test; no game or co-op claim.
 * SPDX-License-Identifier: MIT
 */
#define COBJMACROS
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <stdio.h>

typedef HRESULT (WINAPI *create_device_swapchain_fn)(IDXGIAdapter *,D3D_DRIVER_TYPE,HMODULE,UINT,const D3D_FEATURE_LEVEL *,UINT,UINT,const DXGI_SWAP_CHAIN_DESC *,IDXGISwapChain **,ID3D11Device **,D3D_FEATURE_LEVEL *,ID3D11DeviceContext **);
int main(void)
{
    HWND window=CreateWindowExA(0,"STATIC","Coop Direct3D denetimi",WS_OVERLAPPEDWINDOW,0,0,96,96,NULL,NULL,GetModuleHandleA(NULL),NULL);
    HMODULE d3d11;
    create_device_swapchain_fn create;
    IDXGISwapChain *swap=NULL;
    ID3D11Device *device=NULL;
    ID3D11DeviceContext *context=NULL;
    ID3D11Texture2D *back=NULL,*staging=NULL;
    ID3D11RenderTargetView *target=NULL;
    DXGI_SWAP_CHAIN_DESC swap_desc={0};
    D3D11_TEXTURE2D_DESC texture_desc;
    D3D11_MAPPED_SUBRESOURCE mapped;
    D3D_FEATURE_LEVEL level;
    HRESULT hr;
    int result=1;
    const float color[4]={0.25f,0.5f,0.75f,1.0f};
    if(!window){printf("D3D11_PROBE window_failed=%lu\n",GetLastError());return 1;}
    ShowWindow(window,SW_SHOW);UpdateWindow(window);
    d3d11=LoadLibraryA("d3d11.dll");
    if(!d3d11){printf("D3D11_PROBE dll_load_failed=%lu\n",GetLastError());DestroyWindow(window);return 1;}
    create=(create_device_swapchain_fn)GetProcAddress(d3d11,"D3D11CreateDeviceAndSwapChain");
    if(!create){printf("D3D11_PROBE entry_missing\n");goto done;}
    printf("D3D11_PROBE dll_loaded\n");fflush(stdout);
    swap_desc.BufferDesc.Width=64;swap_desc.BufferDesc.Height=64;
    swap_desc.BufferDesc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;
    swap_desc.SampleDesc.Count=1;
    swap_desc.BufferUsage=DXGI_USAGE_RENDER_TARGET_OUTPUT;
    swap_desc.BufferCount=2;swap_desc.OutputWindow=window;
    swap_desc.Windowed=TRUE;swap_desc.SwapEffect=DXGI_SWAP_EFFECT_DISCARD;
    hr=create(NULL,D3D_DRIVER_TYPE_HARDWARE,NULL,0,NULL,0,D3D11_SDK_VERSION,&swap_desc,&swap,&device,&level,&context);
    if(FAILED(hr)){printf("D3D11_PROBE create_device_failed=%08lx\n",(unsigned long)hr);goto done;}
    hr=IDXGISwapChain_GetBuffer(swap,0,&IID_ID3D11Texture2D,(void **)&back);
    if(FAILED(hr))goto failed;
    hr=ID3D11Device_CreateRenderTargetView(device,(ID3D11Resource *)back,NULL,&target);
    if(FAILED(hr))goto failed;
    ID3D11DeviceContext_ClearRenderTargetView(context,target,color);
    ID3D11Texture2D_GetDesc(back,&texture_desc);
    texture_desc.Usage=D3D11_USAGE_STAGING;texture_desc.BindFlags=0;
    texture_desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;texture_desc.MiscFlags=0;
    hr=ID3D11Device_CreateTexture2D(device,&texture_desc,NULL,&staging);
    if(FAILED(hr))goto failed;
    ID3D11DeviceContext_CopyResource(context,(ID3D11Resource *)staging,(ID3D11Resource *)back);
    hr=ID3D11DeviceContext_Map(context,(ID3D11Resource *)staging,0,D3D11_MAP_READ,0,&mapped);
    if(FAILED(hr))goto failed;
    {
        const unsigned char *pixel=mapped.pData;
        printf("D3D11_PROBE pixel=%u,%u,%u,%u feature=%x\n",pixel[0],pixel[1],pixel[2],pixel[3],(unsigned)level);
        result=!(pixel[0]>=62&&pixel[0]<=66&&pixel[1]>=126&&pixel[1]<=130&&pixel[2]>=189&&pixel[2]<=193&&pixel[3]==255);
    }
    ID3D11DeviceContext_Unmap(context,(ID3D11Resource *)staging,0);
    if(!result){hr=IDXGISwapChain_Present(swap,0,0);if(FAILED(hr))goto failed;printf("D3D11_PROBE frame_readback_and_present_passed\n");}
    goto done;
failed:
    printf("D3D11_PROBE operation_failed=%08lx\n",(unsigned long)hr);result=1;
done:
    if(context)ID3D11DeviceContext_ClearState(context);
    if(target)ID3D11RenderTargetView_Release(target);
    if(staging)ID3D11Texture2D_Release(staging);
    if(back)ID3D11Texture2D_Release(back);
    if(swap)IDXGISwapChain_Release(swap);
    if(context)ID3D11DeviceContext_Release(context);
    if(device)ID3D11Device_Release(device);
    FreeLibrary(d3d11);DestroyWindow(window);
    return result;
}
