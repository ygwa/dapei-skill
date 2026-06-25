// TSX baseline fixture. Verifies JSX self-closing + nested JSX parse cleanly
// (only `tsx` grammar handles <Foo /> as a self-closing element).

import * as React from "react";

interface Props {
  children: React.ReactNode;
  title?: string;
}

export const Card = ({ children, title }: Props) => (
  <div className="card">
    {title && <h2>{title}</h2>}
    {children}
  </div>
);

export const SelfClosing = () => <Foo />;

export const Nested = () => (
  <Foo>
    <Bar />
  </Foo>
);

function Foo(): JSX.Element {
  return <div />;
}
function Bar(): JSX.Element {
  return <span />;
}