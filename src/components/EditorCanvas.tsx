import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect
} from "react";
import { EditorSettings, ImageCoordinates, Color } from "../lib/interfaces";
import Bitmap from "./objects/Bitmap";
import Palette from "./objects/Palette";
import { Tool } from "../lib/consts";

// The pixel grid will not be visible when the scale is smaller than this value.
const PIXELGRID_ZOOM_LIMIT = 8;

interface EditorCanvasProps {
  image: Bitmap;
  palette: Palette;
  selectedPaletteIndex: number;
  settings: EditorSettings;
  scale: number;
  onMouseWheel: (e: WheelEvent) => void;
}

export default function EditorCanvas({
  image,
  palette,
  selectedPaletteIndex,
  settings,
  scale,
  onMouseWheel
}: EditorCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState<number[]>([0, 0]);

  ///////////////////// Drawing Tool
  const [isPainting, setIsPainting] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<ImageCoordinates | undefined>(
    undefined
  );
  const [startPos, setStartPos] = useState<ImageCoordinates>({
    x: 0,
    y: 0
  });
  const [imagePosition, setImagePosition] = useState<ImageCoordinates>({
    x: 0,
    y: 0
  });
  /////////////////////

  const drawImageOnCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (!image) return;

    // Clear the context
    context.clearRect(0, 0, canvas.width, canvas.height);
    // Draw the image at the correct position and scale
    context.drawImage(
      image.getImageCanvasElement(),
      imagePosition.x,
      imagePosition.y,
      image.dimensions.width * scale,
      image.dimensions.height * scale
    );
    // Draw the grid (if we need to)
    if (settings.grid && scale >= PIXELGRID_ZOOM_LIMIT) {
      context.drawImage(
        image.getPixelGridCanvasElement(),
        imagePosition.x,
        imagePosition.y,
        image.dimensions.width * scale,
        image.dimensions.height * scale
      );
    }
  }, [image, imagePosition, canvasRef, scale, settings.grid]);

  /**
   * Handle window resizing and set the new canvasSize state.
   */
  useLayoutEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        setCanvasSize([
          canvasRef.current.clientWidth,
          canvasRef.current.clientHeight
        ]);
      }
    };
    window.addEventListener("resize", () => updateCanvasSize());
  }, []);

  /**
   * Set up the canvas.
   */
  useLayoutEffect(() => {
    console.log("Setting up canvas...");
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    setCanvasSize([canvas.clientWidth, canvas.clientHeight]);
    context.imageSmoothingEnabled = false;
  }, [canvasRef]);

  /**
   * Change the dimensions of the canvas when the canvasSize changes.
   */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = canvasSize[0] * devicePixelRatio;
    canvas.height = canvasSize[1] * devicePixelRatio;
    context.imageSmoothingEnabled = false;
  }, [canvasSize, canvasRef]);

  /**
   * Handle mousewheel zooming
   */
  useLayoutEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.addEventListener("wheel", onMouseWheel);
    }
  }, [onMouseWheel]);

  /**
   * Draw the image whenever the image, imageCanvas, context, scale, or editor
   * settings change.
   */
  useLayoutEffect(() => drawImageOnCanvas(), [
    drawImageOnCanvas,
    palette,
    canvasSize
  ]);

  /////////////////////////////////////////////////////////////////////////////
  // Drawing Tool
  const getMousePos = (e: MouseEvent): ImageCoordinates | undefined => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      }
    }
    return undefined;
  };

  const getImageCoord = useCallback(
    (mousePos: ImageCoordinates): ImageCoordinates | undefined => {
      const x = Math.floor((mousePos.x - imagePosition.x) / scale);
      const y = Math.floor((mousePos.y - imagePosition.y) / scale);
      if (x < 0 || x > image.dimensions.width
        || y < 0 || y > image.dimensions.height) return undefined;
      return { x, y };
    },
    [scale, imagePosition]
  );

  const fillPixel = useCallback(
    (pos: ImageCoordinates | undefined, color: Color): void => {
      if (!pos) return;
      if (!canvasRef.current) return;
      const context = canvasRef.current.getContext("2d");
      if (!context) return;

      image.setPixelColor(pos, color);
      drawImageOnCanvas();
    },
    [drawImageOnCanvas, image]
  );

  const bucketFill = useCallback(
    (pos: ImageCoordinates | undefined, newColor: Color): void => {
      // BFS fill
      if (!pos) return;
      const color = image.getPixelColorAt(pos);
      if (color.isEqual(newColor)) return;
      image.setPixelColor(pos, newColor);
      console.log(color);
      let queue = new Array<ImageCoordinates>(pos);
      let explored = new Array<ImageCoordinates>(pos);
      while (queue[0] !== undefined) {
        let curr = queue.shift() as ImageCoordinates;
        let edges = new Array<ImageCoordinates>(0);
        // add edges
        if (curr.y > 0) {
          edges.push({ x: curr.x, y: curr.y - 1 });
        }
        if (curr.y < image.dimensions.height - 1) {
          edges.push({ x: curr.x, y: curr.y + 1 });
        }
        if (curr.x > 0) {
          edges.push({ x: curr.x - 1, y: curr.y });
        }
        if (curr.x < image.dimensions.width - 1) {
          edges.push({ x: curr.x + 1, y: curr.y });
        }
        ///
        edges
          .filter(n => !explored.includes(n))
          .forEach(n => {
            explored.push(n);
            if (image.getPixelColorAt(n).isEqual(color)) {
              queue.push(n);
              image.setPixelColor(n, newColor);
            }
          });
      }

      drawImageOnCanvas();
    },
    [image, drawImageOnCanvas]
  );

  const rectangle = useCallback((pos: ImageCoordinates | undefined): void => {
    if (!pos) return;
    if (!canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (!context) return;
    drawImageOnCanvas();
    const color = palette[selectedPaletteIndex];
    const colorString = `rgb(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    context.fillStyle = colorString;
    context.lineWidth = 1;
    context.rect(
      startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    context.fill();
  }, [startPos, drawImageOnCanvas]);

  // const drawRectangle = (
  //   startingPos: ImageCoordinates,
  //   currPos: ImageCoordinates,
  //   color: Color) => {

  // }

  const startPaint = useCallback(
    (e: MouseEvent) => {
      const mousePosition = getMousePos(e);
      if (!mousePosition) return;
      setMousePos(mousePosition);
      const imageCoord = getImageCoord(mousePosition);
      if (!canvasRef.current) return;
      const context = canvasRef.current.getContext('2d');
      if (!context) return;
      // if (!imageCoord) return;
      switch (settings.currentTool) {
        case Tool.PENCIL:
          setIsPainting(true);
          fillPixel(imageCoord, palette[selectedPaletteIndex]);
          break;
        case Tool.BUCKET:
          bucketFill(
            imageCoord,
            palette[selectedPaletteIndex]
          );
          break;
        case Tool.SQUARE:
          if (!imageCoord) return;
          const startingPos = {
            x: imagePosition.x + imageCoord.x * scale,
            y: imagePosition.y + imageCoord.y * scale
          }
          setStartPos(startingPos);
          setIsPainting(true);
        case Tool.PAN:
          setIsPainting(true);
          break;
      }
    },
    [
      settings.currentTool,
      scale,
      bucketFill,
      fillPixel,
      getImageCoord,
      palette,
      selectedPaletteIndex
    ]
  );

  const paint = useCallback(
    (e: MouseEvent) => {
      const newMousePos = getMousePos(e);
      if (!newMousePos) return;
      const imageCoord = getImageCoord(newMousePos);
      switch (settings.currentTool) {
        case Tool.PENCIL:
          if (isPainting) {
            fillPixel(
              imageCoord,
              palette[selectedPaletteIndex]
            );
            setMousePos(newMousePos);
          }
          break;
        case Tool.SQUARE:
          if (isPainting) {
            if (!imageCoord) return;
            const endingPos = {
              x: imagePosition.x + imageCoord.x * scale,
              y: imagePosition.y + imageCoord.y * scale
            }
            rectangle(endingPos);
          }
          break;
        case Tool.ELLIPSE:
          break;
        case Tool.PAN:
          if (isPainting && mousePos) {
            const newImagePosition = {
              x: imagePosition.x + (newMousePos.x - mousePos.x),
              y: imagePosition.y + (newMousePos.y - mousePos.y)
            };
            setImagePosition(newImagePosition);
            setMousePos(newMousePos);
          }
          break;
      }
    },
    [
      isPainting,
      fillPixel,
      rectangle,
      getImageCoord,
      palette,
      selectedPaletteIndex,
      imagePosition,
      mousePos,
      settings.currentTool,
      scale
    ]
  );

  const stopPaint = useCallback(() => {
    setMousePos(undefined);
    setIsPainting(false);
    if (settings.currentTool === Tool.SQUARE) {
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.addEventListener("mousedown", startPaint);
    return () => canvas.removeEventListener("mousedown", startPaint);
  }, [startPaint]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.addEventListener("mousemove", paint);
    return () => {
      canvas.removeEventListener("mousemove", paint);
    };
  }, [paint]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.addEventListener("mouseup", stopPaint);
    canvas.addEventListener("mouseleave", stopPaint);
    return () => {
      canvas.removeEventListener("mouseup", stopPaint);
      canvas.removeEventListener("mouseleave", stopPaint);
    };
  }, [stopPaint]);

  /////////////////////////////////////////////////////////////////////////////

  return (
    <canvas
      ref={canvasRef}
      className={generateEditorCanvasProps(settings.currentTool)}
    />
  );
}

const generateEditorCanvasProps = (tool: Tool): string => {
  const base = "image-canvas ";
  switch (tool) {
    case Tool.PENCIL:
      return base + "pencil";
    case Tool.BUCKET:
      return base + "bucket";
    case Tool.SQUARE:
      return base + "square";
    case Tool.PAN:
      return base + "pan";
  }
  return base;
};