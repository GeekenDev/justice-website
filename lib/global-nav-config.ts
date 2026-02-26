import rawGlobalNavConfig from "@/config/global-nav.json";
import type { GlobalNavItem } from "@/components/global-nav";

export type GlobalNavConfig = {
  mobileTitle: string;
  initiallyExpandedGroups: string[];
  items: GlobalNavItem[];
};

export const globalNavConfig = rawGlobalNavConfig as GlobalNavConfig;
