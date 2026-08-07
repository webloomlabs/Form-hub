import Link from "next/link";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * A button-styled link.
 *
 * base-ui's Button assumes it renders a real `<button>` and warns when it
 * doesn't, because swapping in an `<a>` silently drops native button
 * semantics. Rendering a Link is legitimate — navigation *should* be an
 * anchor — so `nativeButton={false}` tells base-ui that's intentional and
 * keeps the a11y semantics honest. Doing it here means no call site has to
 * remember.
 */
export function ButtonLink({
  href,
  children,
  ...props
}: Omit<ButtonProps, "render" | "nativeButton"> & {
  href: string;
}) {
  return (
    <Button nativeButton={false} render={<Link href={href} />} {...props}>
      {children}
    </Button>
  );
}
