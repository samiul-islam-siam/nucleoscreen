# nucleoscreen
### A LCD Glyph Generator

A pixel editor for creating custom characters on HD44780-based LCD displays with nucleo boards. It gives ready-to-use C code with hex values.

## How to use

1. **Click pixels** on any character cell to toggle them on/off
2. **Drag** across pixels to paint multiple at once
3. Up to **8 segments** can be used or active at a time (hardware CGRAM limit)
4. Switch between **function only** or **full code** output using the button in the sidebar
5. Hit **copy** in the top-right of the code panel to copy the generated C code
6. You can change the **appearance** using the top-right corner button

## Live demo

👉 [Try it here](https://samiul-islam-siam.github.io/nucleoscreen/)

## Library

This tool generates code for the HD44780 LCD library (e.g. LCD 1602A):  
[🔗 lcd lib for stm32](https://github.com/samiul-islam-siam/STM32-Lab/tree/Experiments)
