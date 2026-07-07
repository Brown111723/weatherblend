# WeatherIcon

The app's condition glyph, composed procedurally from a WMO weather code — sun/moon + cloud + rain streaks / snow / fog / thunder layered together. Not a static icon set; the parts assemble per code.

```jsx
<WeatherIcon code={61} size={26} />        {/* light rain  */}
<WeatherIcon code={0} night size={40} />    {/* clear night */}
<WeatherIcon code={95} />                    {/* thunder     */}
```

Codes follow the WMO scale used by Open-Meteo. `night` swaps the sun for a moon.
