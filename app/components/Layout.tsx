import { Container } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import Header from "./Header";
import Footer from "./Footer";

const Layout = ({ children }: PropsWithChildren) => {
  return (
    <Container>
      <Header />
      {children}
      <Footer />
    </Container>
  );
}

export default Layout;