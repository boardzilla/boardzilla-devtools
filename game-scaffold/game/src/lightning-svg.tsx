import React from "react";

export default ({amount}: {amount: number}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="539.335"
    height="684.46"
    className="lightning"
    version="1.1"
    viewBox="0 0 142.699 181.097"
  >
    <defs>
      <path id="rect1" d="M145.075 80.331H336.71V268.461H145.075z"></path>
    </defs>
    <g fillOpacity="1" transform="translate(-37.764 -54.286)">
      <path
        fill="#f1ff20"
        stroke="#000"
        strokeDasharray="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="1"
        strokeWidth="5.08"
        d="M62.21 70.893l-21.906 36.983 21.225-5.59-11.366 41.934 20.771-6.662-11.984 37.931 36.777-9.364-17.65 43.503 18.607-7.75-6.946 17.757 16.564-5.506-6.351 18.714 49.715-48.925-32.237 8.73 52.801-72.726-25.639 8.313 27.454-46.327-15.284 3.527 21.163-28.61z"
      ></path>
      <text
        x="24.32"
        y="0"
        fill="#000"
        textAnchor="middle"
        stroke="none"
        strokeWidth="10.56"
        display="inline"
        fontFamily="Din Condensed Web"
        fontSize="58.083"
        fontStretch="condensed"
        fontWeight="bold"
        transform="matrix(.68696 0 0 .69532 -61.273 15.655)"
        xmlSpace="preserve"
        style={{
          textAlign: "center",
          whiteSpace: "pre",
        }}
      >
        <tspan x="242" y="195.032">
          <tspan fontSize="134.956">{amount}</tspan>
        </tspan>
      </text>
    </g>
  </svg>
);
