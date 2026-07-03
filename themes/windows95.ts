import { extendTheme } from '@chakra-ui/react';
import { swiperStyles } from './swiperStyles';

export const windows95Theme = extendTheme({
    initialColorMode: 'dark',
    useSystemColorMode: false,
    colors: {
        background: '#1a2332', // Dark navy background from branding
        text: '#ffffff', // White text for dark mode
        primary: '#00a8ff', // Bright cyan blue from logo
        secondary: '#2563eb', // Medium blue from branding
        accent: '#06b6d4', // Cyan accent from wings/elements
        muted: '#2d3748', // Dark gray for muted elements
        border: '#374151', // Subtle border color
        error: '#ef4444', // Modern red for errors
        success: '#10b981', // Modern green for success
        warning: '#f59e0b', // Modern orange for warnings
    },
    fonts: {
        heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
        body: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
        mono: '"JetBrains Mono", "Fira Code", monospace',
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
        '6xl': '60px',
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
        tb1: '1px solid #374151',
        borderRadius: 'md',
    },
    radii: {
        none: '0',
        sm: '6px',
        base: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
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
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        sm: '0 1px 3px 0 rgba(0, 0, 0, 0.4)',
        base: '0 2px 4px 0 rgba(0, 0, 0, 0.4)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.5)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
        outline: '0 0 0 3px rgba(0, 168, 255, 0.4)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.6)',
        none: 'none',
        'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
    },
    components: {
        Link: {
            baseStyle: {
                color: 'primary',
                _hover: { textDecoration: 'underline' },
            },
        },
        Button: {
            baseStyle: {
                fontWeight: '600',
                borderRadius: 'md',
                transition: 'all 0.2s',
            },
            sizes: {
                sm: {
                    fontSize: 'sm',
                    px: 4,
                    py: 2,
                    h: '32px',
                },
                md: {
                    fontSize: 'md',
                    px: 6,
                    py: 3,
                    h: '40px',
                },
                lg: {
                    fontSize: 'lg',
                    px: 8,
                    py: 4,
                    h: '48px',
                },
            },
            variants: {
                solid: {
                    bg: 'primary',
                    color: 'white',
                    _hover: {
                        bg: 'accent',
                        transform: 'translateY(-1px)',
                        boxShadow: 'md',
                    },
                    _active: {
                        transform: 'translateY(0)',
                    },
                },
                outline: {
                    borderColor: 'primary',
                    color: 'primary',
                    borderWidth: '2px',
                    _hover: {
                        bg: 'rgba(0, 168, 255, 0.1)',
                    },
                },
                ghost: {
                    color: 'primary',
                    _hover: {
                        bg: 'rgba(0, 168, 255, 0.1)',
                    },
                },
            },
        },
        Input: {
            baseStyle: {
                field: {
                    bg: 'muted',
                    borderColor: 'border',
                    borderRadius: 'md',
                    color: 'text',
                    _hover: {
                        borderColor: 'primary',
                    },
                    _focus: {
                        borderColor: 'primary',
                        boxShadow: 'outline',
                        bg: 'muted',
                    },
                    _placeholder: {
                        color: 'gray.500',
                    },
                },
            },
            sizes: {
                md: {
                    field: {
                        fontSize: 'md',
                        px: 4,
                        py: 3,
                        h: '40px',
                    },
                },
            },
            variants: {
                outline: {
                    field: {
                        bg: 'transparent',
                        borderWidth: '2px',
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
                        borderWidth: '2px',
                        borderColor: 'transparent',
                        _hover: {
                            bg: 'muted',
                            borderColor: 'border',
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
        Menu: {
            baseStyle: {
                // Chakra's default Menu styling switches on its own internal color-mode
                // state (independent of this theme's fixed dark palette). If that ever
                // desyncs to "light" — e.g. a stale chakra-ui-color-mode value — the list
                // renders white-on-white and becomes unreadable. Pin it to our tokens so
                // it can never depend on that state.
                list: {
                    bg: 'muted',
                    borderColor: 'border',
                    borderWidth: '1px',
                    borderRadius: 'md',
                    boxShadow: 'lg',
                    py: 1,
                },
                item: {
                    bg: 'transparent',
                    color: 'text',
                    _hover: { bg: 'background' },
                    _focus: { bg: 'background' },
                    _active: { bg: 'background' },
                },
            },
        },
        Modal: {
            baseStyle: {
                dialog: {
                    bg: 'background',
                    color: 'text',
                    borderRadius: 'lg',
                    boxShadow: 'xl',
                    border: '1px solid',
                    borderColor: 'border',
                },
                header: {
                    color: 'text',
                    fontWeight: 'bold',
                    fontSize: 'xl',
                    pb: 4,
                    borderBottom: '1px solid',
                    borderColor: 'border',
                },
                closeButton: {
                    color: 'text',
                    _hover: {
                        bg: 'muted',
                    },
                },
                body: {
                    color: 'text',
                    py: 6,
                },
            },
        },
    },
});
