import { extendTheme } from '@chakra-ui/react';
import { swiperStyles } from './swiperStyles';

export const hackerTheme = extendTheme({
    initialColorMode: 'dark', // set 'light' or 'dark' as the default color mode
    useSystemColorMode: false,
    colors: {
        background: '#06111f',
        text: '#E8F4FF',
        primary: '#18A8FF',
        secondary: '#0D2238',
        accent: '#66E4FF',
        muted: '#0B1A2C',
        border: '#173A5C',
        error: '#FF5C7A',
        success: '#42E7A2',
        warning: '#FFC857',
    },
    fonts: {
        heading: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        body: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    },
    fontSizes: {
        xs: '12px',
        sm: '14px',
        md: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
        '4xl': '36px',
        '5xl': '48px',
        '6xl': '64px',
    },
    fontWeights: {
        normal: 400,
        medium: 600,
        bold: 700,
    },
    lineHeights: {
        normal: 'normal',
        none: 1,
        shorter: 1.25,
        short: 1.375,
        base: 1.5,
        tall: 1.625,
        taller: '2',
    },
    borders: {
        tb1: '1px solid rgba(102, 228, 255, 0.18)',
        borderRadius: '22px',
    },
    radii: {
        none: '0',
        sm: '4px',
        base: '10px',
        md: '10px',
        lg: '12px',
        xl: '14px',
        '2xl': '16px',
        '3xl': '20px',
        full: '9999px',
    },
    space: {
        px: '1px',
        0: '0',
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        32: '8rem',
        40: '10rem',
        48: '12rem',
        56: '14rem',
        64: '16rem',
    },
    sizes: {
        max: 'max-content',
        min: 'min-content',
        full: '100%',
        '3xs': '14rem',
        '2xs': '16rem',
        xs: '20rem',
        sm: '24rem',
        md: '28rem',
        lg: '32rem',
        xl: '36rem',
        '2xl': '42rem',
        '3xl': '48rem',
        '4xl': '56rem',
        '5xl': '64rem',
        '6xl': '72rem',
        '7xl': '80rem',
        container: {
            sm: '640px',
            md: '768px',
            lg: '1024px',
            xl: '1280px',
        },
    },
    shadows: {
        xs: '0 0 0 1px rgba(102, 228, 255, 0.12)',
        sm: '0 10px 28px rgba(0, 0, 0, 0.22)',
        base: '0 18px 44px rgba(0, 0, 0, 0.28)',
        md: '0 18px 42px rgba(0, 0, 0, 0.34), 0 0 24px rgba(24, 168, 255, 0.08)',
        lg: '0 24px 60px rgba(0, 0, 0, 0.38), 0 0 34px rgba(24, 168, 255, 0.12)',
        xl: '0 30px 80px rgba(0, 0, 0, 0.42), 0 0 50px rgba(24, 168, 255, 0.16)',
        '2xl': '0 36px 100px rgba(0, 0, 0, 0.48), 0 0 70px rgba(24, 168, 255, 0.18)',
        outline: '0 0 0 3px rgba(24, 168, 255, 0.34)',
        inner: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        none: 'none',
        'dark-lg': '0 24px 60px rgba(0, 0, 0, 0.42)',
    },
    components: {
        Link: {
            baseStyle: {
                color: 'primary',
                _hover: {
                    textDecoration: 'underline',
                },
            },
        },
        Button: {
            baseStyle: {
                fontWeight: '700',
                borderRadius: 'base',
                letterSpacing: '-0.01em',
            },
            sizes: {
                sm: {
                    fontSize: 'sm',
                    px: 4,
                    py: 3,
                },
                md: {
                    fontSize: 'md',
                    px: 6,
                    py: 4,
                },
            },
            variants: {
                solid: {
                    bg: 'linear-gradient(135deg, #18A8FF 0%, #0D7CFF 100%)',
                    color: 'white',
                    boxShadow: '0 12px 28px rgba(24, 168, 255, 0.28)',
                    _hover: {
                        filter: 'brightness(1.08)',
                        transform: 'translateY(-1px)',
                    },
                },
                outline: {
                    borderColor: 'primary',
                    color: 'primary',
                    _hover: {
                        bg: 'rgba(24, 168, 255, 0.10)',
                    },
                },
                ghost: {
                    color: 'text',
                    _hover: {
                        bg: 'rgba(24, 168, 255, 0.10)',
                    },
                },
            },
        },
        Input: {
            baseStyle: {
                field: {
                    borderColor: 'border',
                    _focus: {
                        borderColor: 'primary',
                        boxShadow: 'outline',
                    },
                },
            },
            sizes: {
                md: {
                    field: {
                        fontSize: 'md',
                        px: 4,
                        py: 2,
                    },
                },
            },
            variants: {
                outline: {
                    field: {
                        borderColor: 'border',
                        _hover: {
                            borderColor: 'primary',
                        },
                        _focus: {
                            borderColor: 'primary',
                            boxShadow: 'outline',
                        },
                    },
                },
                filled: {
                    field: {
                        bg: 'muted',
                        _hover: {
                            bg: 'muted',
                        },
                        _focus: {
                            bg: 'muted',
                            borderColor: 'primary',
                        },
                    },
                },
            },
        },
        Text: {
            baseStyle: {
                color: 'text',
            },
        },
    },
});
