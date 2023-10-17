import React from "react";

export default ({number} : {number: number}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
    version="1.1"
    viewBox="0 0 431.376 326.937"
  >
    <path
      fill="#fff"
      fillOpacity="1"
      stroke="#000"
      strokeDasharray="none"
      strokeOpacity="1"
      strokeWidth="10.56"
      d="M6.307 249.454l-1.006-44.98 16.422-45.783 23.35-2.031 2.03-38.163 53.342-15.229-.701-48.172L218.058 5.714l115.994 47.533-.296 51.299 52.702 10.757 2.67 39.44 23.349 1.393 13.246 47.253.339 45.182-208.536 72.78z"
    ></path>
    <text
      x="24.32"
      y="0"
      fill="#000"
      fillOpacity="1"
      stroke="none"
      strokeWidth="10.56"
      display="inline"
      fontFamily="Din Condensed Web"
      fontSize="58.083"
      fontStretch="condensed"
      fontWeight="bold"
      transform="matrix(2 0 0 2 -217.615 -149.722)"
      xmlSpace="preserve"
      style={{
        textAlign: "center",
        whiteSpace: "pre",
      }}
    >
      <tspan x="188.452" y="214.25">
        <tspan display="inline" fontSize="160">
          {number}
        </tspan>
      </tspan>
    </text>
  </svg>
);
