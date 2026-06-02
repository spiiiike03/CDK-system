import type { Metadata } from "next";
import { PixOrdersConsole } from "@/components/pix-orders-console";

export const metadata: Metadata = {
  title: "Pix 待支付订单",
  description: "ChatGPT Plus Pix 待支付订单展示页。",
};

export default function PixPage() {
  return <PixOrdersConsole />;
}
