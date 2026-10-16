// Wivra B1G: original-preserving still-photo looks, processed entirely on-device.
// Uses public Apple Core Image APIs, no external filters, scripts, network or SDK.
// Applies to images already captured and does not claim sensor/low-light control.
import Foundation
import UIKit
import CoreImage

enum WivraPhotoLook: String, CaseIterable, Identifiable, Sendable {
    case original
    case warmFilm
    case monochrome
    case vintage
    case grainy
    case nightSoft

    var id: String { rawValue }
    var label: String {
        switch self {
        case .original: "Original"
        case .warmFilm: "Película cálida"
        case .monochrome: "Blanco y negro"
        case .vintage: "Vintage"
        case .grainy: "Grano analógico"
        case .nightSoft: "Noche suave (edición)"
        }
    }
}

enum WivraPhotoLookError: LocalizedError {
    case invalidPhoto, renderFailed, invalidStrength

    var errorDescription: String? {
        switch self {
        case .invalidPhoto: "La fotografía original no se puede decodificar."
        case .renderFailed: "No se pudo generar una copia con el filtro."
        case .invalidStrength: "La intensidad del filtro no es válida."
        }
    }
}

enum WivraPhotoLooks {
    // CIContext is reused for still images only, not for the video capture loop.
    private static let context = CIContext()

    private static func apply(_ name: String, to image: CIImage,
                              parameters: [String: Any] = [:]) throws -> CIImage {
        var options = parameters
        options[kCIInputImageKey] = image
        guard let filter = CIFilter(name: name, parameters: options),
              let output = filter.outputImage else {
            throw WivraPhotoLookError.renderFailed
        }
        return output.cropped(to: image.extent)
    }

    static func renderJPEG(_ sourceBytes: Data, look: WivraPhotoLook,
                           strength: Double) throws -> Data {
        guard strength.isFinite && strength >= 0 && strength <= 1 else {
            throw WivraPhotoLookError.invalidStrength
        }
        // On "Original" return original JPEG bytes without lossy recompression.
        guard UIImage(data: sourceBytes) != nil else { throw WivraPhotoLookError.invalidPhoto }
        if look == .original || strength == 0 { return sourceBytes }

        guard let image = UIImage(data: sourceBytes),
              let input = CIImage(image: image) else { throw WivraPhotoLookError.invalidPhoto }
        let amount = Float(strength)
        var output = input

        switch look {
        case .original: break
        case .warmFilm:
            output = try apply("CISepiaTone", to: output,
                               parameters: [kCIInputIntensityKey: 0.58 * amount])
            output = try apply("CIColorControls", to: output,
                               parameters: [kCIInputSaturationKey: 1.0 + 0.10 * amount,
                                            kCIInputContrastKey: 1.0 + 0.08 * amount])
        case .monochrome:
            output = try apply("CIColorControls", to: output,
                               parameters: [kCIInputSaturationKey: 1.0 - amount,
                                            kCIInputContrastKey: 1.0 + 0.20 * amount])
        case .vintage:
            output = try apply("CISepiaTone", to: output,
                               parameters: [kCIInputIntensityKey: 0.78 * amount])
            output = try apply("CIColorControls", to: output,
                               parameters: [kCIInputSaturationKey: 1.0 - 0.22 * amount,
                                            kCIInputContrastKey: 1.0 - 0.12 * amount])
            output = try apply("CIVignette", to: output,
                               parameters: [kCIInputIntensityKey: 0.65 * amount,
                                            kCIInputRadiusKey: 1.0])
        case .grainy:
            // Crop infinite random noise before compositing; subtle opacity is
            // deliberately limited to preserve detail. No third-party LUTs.
            guard let random = CIFilter(name: "CIRandomGenerator")?.outputImage?.cropped(to: output.extent) else {
                throw WivraPhotoLookError.renderFailed
            }
            let monoNoise = try apply("CIColorMatrix", to: random,
                                      parameters: ["inputRVector": CIVector(x: 1, y: 0, z: 0, w: 0),
                                                   "inputGVector": CIVector(x: 1, y: 0, z: 0, w: 0),
                                                   "inputBVector": CIVector(x: 1, y: 0, z: 0, w: 0),
                                                   "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0),
                                                   "inputBiasVector": CIVector(x: 0, y: 0, z: 0,
                                                                               w: CGFloat(0.14 * strength))])
            output = try apply("CISourceOverCompositing", to: monoNoise,
                               parameters: [kCIInputBackgroundImageKey: output])
        case .nightSoft:
            // Enhances an existing photo. It does NOT increase sensor exposure,
            // replicate Night mode, or recover photons the camera did not record.
            output = try apply("CINoiseReduction", to: output,
                               parameters: ["inputNoiseLevel": 0.02 + 0.035 * amount,
                                            "inputSharpness": 0.35])
            output = try apply("CIColorControls", to: output,
                               parameters: [kCIInputBrightnessKey: 0.07 * amount,
                                            kCIInputContrastKey: 1.0 + 0.10 * amount,
                                            kCIInputSaturationKey: 1.0 - 0.07 * amount])
        }

        guard let cg = context.createCGImage(output, from: input.extent),
              let jpeg = UIImage(cgImage: cg).jpegData(compressionQuality: 0.92) else {
            throw WivraPhotoLookError.renderFailed
        }
        return jpeg
    }
}
