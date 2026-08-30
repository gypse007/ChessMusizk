import sys


def _disable_mlx_vae():
    try:
        import acestep.core.generation.handler.mlx_vae_decode_native as mlx_mod

        mlx_mod.MlxVaeDecodeNativeMixin._mlx_vae_decode = (
            lambda self, latents: (_ for _ in ()).throw(RuntimeError("MLX VAE disabled"))
        )
    except Exception:
        pass


_disable_mlx_vae()
