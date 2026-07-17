// SPDX-License-Identifier: GPL-3.0-only
import ExpoModulesCore
import ImageIO
import UIKit
import Vision

public final class ReimbursdVisionOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReimbursdVisionOcr")

    AsyncFunction("recognizeText") { (uri: String) -> [String: Any] in
      guard
        let url = URL(string: uri),
        url.isFileURL,
        let image = UIImage(contentsOfFile: url.path),
        let cgImage = image.cgImage
      else {
        throw InvalidOcrImageException()
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.automaticallyDetectsLanguage = true

      let handler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: image.imageOrientation.visionOrientation,
        options: [:]
      )

      do {
        try handler.perform([request])
      } catch {
        throw OcrRecognitionException()
      }

      let observations = (request.results ?? []).sorted { first, second in
        if first.boundingBox.minY != second.boundingBox.minY {
          return first.boundingBox.minY > second.boundingBox.minY
        }
        return first.boundingBox.minX < second.boundingBox.minX
      }
      let blocks: [[String: Any]] = observations.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else {
          return nil
        }

        let box = observation.boundingBox
        return [
          "text": candidate.string,
          "confidence": Double(candidate.confidence),
          "boundingBox": [
            "x": Double(box.minX),
            "y": Double(1 - box.maxY),
            "width": Double(box.width),
            "height": Double(box.height)
          ]
        ]
      }

      return [
        "text": blocks.compactMap { $0["text"] as? String }.joined(separator: "\n"),
        "blocks": blocks
      ]
    }
  }
}

private extension UIImage.Orientation {
  var visionOrientation: CGImagePropertyOrientation {
    switch self {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}

private final class InvalidOcrImageException: Exception {
  override var reason: String {
    "The local OCR image could not be opened."
  }
}

private final class OcrRecognitionException: Exception {
  override var reason: String {
    "On-device text recognition failed."
  }
}
