import { createFileRoute } from "@tanstack/react-router"
import { CarouselEditor } from "~/components/carousel-editor"

export const Route = createFileRoute("/carousel-editor")({
  component: CarouselEditorPage,
})

function CarouselEditorPage() {
  return <CarouselEditor />
}
