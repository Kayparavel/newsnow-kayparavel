import { createFileRoute } from "@tanstack/react-router"
import { Carousel } from "~/components/carousel"

export const Route = createFileRoute("/carousel")({
  component: CarouselPage,
})

function CarouselPage() {
  return <Carousel />
}
