import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Keyboard,
  KeyboardEvent,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region, MapPressEvent, MapType, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { usePonds, useCreatePond } from '../hooks/useOfflineData';
import { useAuth } from '../contexts/AuthContext';

// Types
interface Coordinate {
  latitude: number;
  longitude: number;
}

interface PondBoundary {
  coordinates: Coordinate[];
  area: number;
}

type MapMode = 'view' | 'point' | 'polygon';

const MIN_BOTTOM_SHEET_SAFE_GAP = 28;
const MODAL_TOP_SAFE_GAP = 24;
const ANDROID_KEYBOARD_CLEARANCE = 8;
const IOS_KEYBOARD_CLEARANCE = 8;

const MAP_TYPES: { label: string; value: MapType }[] = [
  { label: 'Standard', value: 'standard' },
  { label: 'Satellite', value: 'satellite' },
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'Terrain', value: 'terrain' },
];

// Calculate polygon area using shoelace formula
function calculatePolygonArea(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) return 0;

  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i].longitude * coordinates[j].latitude;
    area -= coordinates[j].longitude * coordinates[i].latitude;
  }

  area = Math.abs(area) * 0.5;
  // Convert to square meters (approximate for small areas)
  return area * 111320 * 111320;
}

function formatArea(areaSqM: number): string {
  if (areaSqM < 10000) {
    return `${Math.round(areaSqM)} m²`;
  }
  const hectares = areaSqM / 10000;
  if (hectares < 100) {
    return `${hectares.toFixed(2)} ha`;
  }
  const sqKm = areaSqM / 1000000;
  return `${sqKm.toFixed(2)} km²`;
}

function parseLocation(location: string): Coordinate | null {
  const parts = location.split(',').map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { latitude: parts[0], longitude: parts[1] };
  }
  return null;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
  const mapRef = useRef<MapView | null>(null);

  const [region, setRegion] = useState<Region>({
    latitude: 14.5995,
    longitude: 120.9842,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [selectedLocation, setSelectedLocation] = useState<Coordinate | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Coordinate[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>('view');
  const [modalVisible, setModalVisible] = useState(false);
  const [pondName, setPondName] = useState('');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const { ponds } = usePonds();
  const createPond = useCreatePond();
  const { user } = useAuth();
  const restingSheetBottom = Math.max(insets.bottom, MIN_BOTTOM_SHEET_SAFE_GAP);
  const keyboardClearance = Platform.OS === 'android' ? ANDROID_KEYBOARD_CLEARANCE : IOS_KEYBOARD_CLEARANCE;
  const sheetBottom = keyboardOffset > 0
    ? keyboardOffset + keyboardClearance
    : restingSheetBottom;
  const sheetMaxHeight = Math.max(
    280,
    Dimensions.get('window').height - sheetBottom - insets.top - MODAL_TOP_SAFE_GAP
  );

  const focusRegion = useCallback((nextRegion: Region, animated = true) => {
    setRegion(nextRegion);

    if (animated) {
      mapRef.current?.animateToRegion(nextRegion, 600);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed to show your position on the map.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      focusRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0045,
        longitudeDelta: 0.0045,
      });
    })();
  }, [focusRegion]);

  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: KeyboardEvent) => {
      const keyboardHeight = Math.max(0, event.endCoordinates?.height || 0);
      const screenHeight = Dimensions.get('screen').height;
      const keyboardTop = event.endCoordinates?.screenY || screenHeight;
      const keyboardOverlap = Math.max(0, screenHeight - keyboardTop);
      const nextOffset = Math.max(0, Math.max(keyboardHeight, keyboardOverlap));
      setKeyboardOffset(nextOffset);
    };

    const handleKeyboardHide = () => {
      setKeyboardOffset(0);
    };

    const showSubscription = Keyboard.addListener(keyboardShowEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(keyboardHideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const handleMapPress = useCallback((event: MapPressEvent) => {
    const { coordinate } = event.nativeEvent;

    if (mapMode === 'point') {
      setSelectedLocation(coordinate);
    } else if (mapMode === 'polygon') {
      setPolygonPoints(prev => [...prev, coordinate]);
    }
  }, [mapMode]);

  const undoLastPoint = () => {
    setPolygonPoints(prev => prev.slice(0, -1));
  };

  const clearPolygon = () => {
    setPolygonPoints([]);
  };

  const finishPolygon = () => {
    if (polygonPoints.length < 3) {
      Alert.alert('Error', 'Please add at least 3 points to create a pond boundary');
      return;
    }
    setModalVisible(true);
  };

  const handleCreatePond = async () => {
    if (!pondName.trim() || !user) return;

    const centerPoint = mapMode === 'point'
      ? selectedLocation
      : polygonPoints.length > 0
        ? {
          latitude: polygonPoints.reduce((sum, p) => sum + p.latitude, 0) / polygonPoints.length,
          longitude: polygonPoints.reduce((sum, p) => sum + p.longitude, 0) / polygonPoints.length,
        }
        : null;

    if (!centerPoint) {
      Alert.alert('Error', 'No location selected');
      return;
    }

    setLoading(true);
    try {
      await createPond({
        name: pondName.trim(),
        location: `${centerPoint.latitude}, ${centerPoint.longitude}`,
        createdBy: user.id,
        // Store polygon boundary if created with polygon mode
        boundary: mapMode === 'polygon' && polygonPoints.length >= 3
          ? JSON.stringify(polygonPoints)
          : undefined,
      });

      setModalVisible(false);
      setPondName('');
      setSelectedLocation(null);
      setPolygonPoints([]);
      setMapMode('view');
      Alert.alert('Success', 'Pond created successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create pond');
    } finally {
      setLoading(false);
    }
  };

  const showMapTypeSelector = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...MAP_TYPES.map(t => t.label), 'Cancel'],
          cancelButtonIndex: MAP_TYPES.length,
        },
        (buttonIndex) => {
          if (buttonIndex < MAP_TYPES.length) {
            setMapType(MAP_TYPES[buttonIndex].value);
          }
        }
      );
    } else {
      Alert.alert(
        'Map Type',
        'Select map view',
        [
          ...MAP_TYPES.map((type) => ({
            text: type.label,
            onPress: () => setMapType(type.value),
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const showModeSelector = () => {
    Alert.alert(
      'Add Pond',
      'How would you like to mark the pond?',
      [
        {
          text: '📍 Single Point',
          onPress: () => {
            setMapMode('point');
            setPolygonPoints([]);
          },
        },
        {
          text: '⬡ Draw Boundary',
          onPress: () => {
            setMapMode('polygon');
            setSelectedLocation(null);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const cancelEditing = () => {
    setMapMode('view');
    setSelectedLocation(null);
    setPolygonPoints([]);
  };

  const centerOnMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const location = await Location.getCurrentPositionAsync({});
      focusRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0035,
        longitudeDelta: 0.0035,
      });
    } catch (_error) {
      Alert.alert('Location Unavailable', 'Unable to get your current location right now.');
    } finally {
      setLocating(false);
    }
  }, [focusRegion]);

  const pointReadyToSave = mapMode === 'point' && !!selectedLocation;
  const polygonReadyToSave = mapMode === 'polygon' && polygonPoints.length >= 3;
  const canConfirmEdit = pointReadyToSave || polygonReadyToSave;
  const polygonPointsMissing = Math.max(0, 3 - polygonPoints.length);
  const editHintText =
    mapMode === 'point'
      ? selectedLocation
        ? 'Pin placed. Tap Save Pond to continue.'
        : 'Tap anywhere on the map to place your pond pin.'
      : polygonPoints.length >= 3
        ? 'Boundary ready. Tap Finish Boundary to continue.'
        : `Add ${polygonPointsMissing} more point${polygonPointsMissing === 1 ? '' : 's'} to finish the boundary.`;

  const handleEditConfirm = () => {
    if (pointReadyToSave) {
      setModalVisible(true);
      return;
    }
    if (polygonReadyToSave) {
      finishPolygon();
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        provider={mapProvider}
        mapType={mapType}
      >
        {/* Existing pond markers and polygons */}
        {ponds.map((pond) => {
          const coords = parseLocation(pond.location);
          if (!coords) return null;

          const pondAny = pond as any;
          const hasBoundary = pondAny.boundary;
          let boundaryCoords: Coordinate[] = [];

          if (hasBoundary) {
            try {
              boundaryCoords = JSON.parse(hasBoundary);
            } catch (e) {
              // Invalid boundary data
            }
          }

          return (
            <React.Fragment key={pondAny.id}>
              {/* Show polygon if boundary exists */}
              {boundaryCoords.length >= 3 ? (
                <Polygon
                  coordinates={boundaryCoords}
                  fillColor="rgba(0, 123, 255, 0.3)"
                  strokeColor="#007bff"
                  strokeWidth={2}
                />
              ) : (
                /* Show marker only for point-based ponds */
                <Marker
                  coordinate={coords}
                  title={pond.name}
                  description={pond.location}
                  pinColor="#007bff"
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Single point selection */}
        {selectedLocation && mapMode === 'point' && (
          <Marker
            coordinate={selectedLocation}
            pinColor="#28a745"
            draggable
            onDragEnd={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
          />
        )}

        {/* Polygon drawing */}
        {polygonPoints.length > 0 && (
          <>
            {/* Points */}
            {polygonPoints.map((point, index) => (
              <Marker
                key={index}
                coordinate={point}
                pinColor="#16a34a"
                title={`Point ${index + 1}`}
              />
            ))}

            {/* Lines connecting points with bolder styling */}
            {polygonPoints.length > 1 && (
              <Polyline
                coordinates={polygonPoints}
                strokeColor="#16a34a"
                strokeWidth={4}
              />
            )}

            {/* Closed polygon preview - show fill even with 2 points as a preview */}
            {polygonPoints.length >= 2 && (
              <Polygon
                coordinates={polygonPoints}
                fillColor="rgba(34, 197, 94, 0.35)"
                strokeColor="#16a34a"
                strokeWidth={3}
              />
            )}
          </>
        )}
      </MapView>

      {/* Header overlay */}
      <SafeAreaView style={styles.headerContainer} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>Pond Map</Text>
              <Text style={styles.headerSubtitle}>
                {ponds.length} pond{ponds.length !== 1 ? 's' : ''} registered
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.mapTypeButton}
                onPress={showMapTypeSelector}
                accessibilityRole="button"
                accessibilityLabel="Change map type"
              >
                <Ionicons name="layers-outline" size={22} color="#007bff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Map Type + Locate */}
        <View style={styles.mapInfoRow}>
          <View style={styles.mapTypeLabel}>
            <Text style={styles.mapTypeText}>
              {MAP_TYPES.find(t => t.value === mapType)?.label}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.mapLocateButton}
            onPress={centerOnMyLocation}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel="Center map to my location"
          >
            {locating ? (
              <ActivityIndicator size="small" color="#0b6cd4" />
            ) : (
              <Ionicons name="locate-outline" size={18} color="#0b6cd4" />
            )}
          </TouchableOpacity>
        </View>

        {/* Mode indicator */}
        {mapMode !== 'view' && (
          <View style={styles.modeIndicator}>
            <Ionicons name="create" size={16} color="#fff" />
            <Text style={styles.modeText}>
              {mapMode === 'point' ? 'Tap to place pond marker' : `Tap to add boundary points (${polygonPoints.length})`}
            </Text>
          </View>
        )}

        {mapMode === 'view' && ponds.length === 0 && (
          <View style={styles.emptyMapHint}>
            <Ionicons name="information-circle-outline" size={16} color="#0b6aa8" />
            <Text style={styles.emptyMapHintText}>No ponds yet. Tap Add Pond to add your first pond.</Text>
          </View>
        )}

        {/* Polygon area */}
        {polygonPoints.length >= 3 && (
          <View style={styles.areaBadge}>
            <Text style={styles.areaText}>
              Area: {formatArea(calculatePolygonArea(polygonPoints))}
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Bottom Controls Container */}
      <SafeAreaView
        style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
        edges={['left', 'right']}
      >
        {/* Add Pond Button (View Mode) */}
        {mapMode === 'view' && (
          <View style={styles.addControls}>
            <View style={styles.addHintCard}>
              <Ionicons name="information-circle-outline" size={16} color="#0b6aa8" />
              <Text style={styles.addHintText}>Tap Add Pond, then choose marker or boundary.</Text>
            </View>

            <TouchableOpacity
              style={styles.addPondButton}
              onPress={showModeSelector}
              accessibilityRole="button"
              accessibilityLabel="Add pond"
            >
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.addPondButtonText}>Add Pond</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Editing Controls */}
        {mapMode !== 'view' && (
          <View style={styles.editControls}>
            <View style={styles.editHintBar}>
              <Ionicons
                name={mapMode === 'point' ? 'pin-outline' : 'shapes-outline'}
                size={15}
                color="#0b6aa8"
              />
              <Text style={styles.editHintText}>{editHintText}</Text>
            </View>

            <View style={styles.editButtonsRow}>
              {mapMode === 'polygon' && polygonPoints.length > 0 && (
                <TouchableOpacity style={styles.undoButton} onPress={undoLastPoint}>
                  <Ionicons name="arrow-undo" size={20} color="#666" />
                  <Text style={styles.undoText}>Undo</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.cancelEditButton} onPress={cancelEditing}>
                <Text style={styles.cancelEditText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, !canConfirmEdit && styles.confirmButtonDisabled]}
                onPress={handleEditConfirm}
                disabled={!canConfirmEdit}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.confirmButtonText}>
                  {mapMode === 'point' ? 'Save Pond' : 'Finish Boundary'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Create Pond Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          Keyboard.dismiss();
          setModalVisible(false);
        }}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheetContainer,
              {
                bottom: sheetBottom,
                maxHeight: sheetMaxHeight,
              },
            ]}
          >
            <View
              style={[
                styles.modalContent,
                keyboardOffset > 0 && styles.modalContentKeyboard,
              ]}
            >
              <ScrollView
                style={styles.modalBody}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.modalContentInner,
                  keyboardOffset > 0 && styles.modalContentInnerKeyboard,
                ]}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Create New Pond</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setModalVisible(false);
                    }}
                  >
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                {/* Location/Boundary info */}
                <View style={styles.infoBox}>
                  {mapMode === 'point' && selectedLocation ? (
                    <>
                      <Ionicons name="location" size={16} color="#007bff" />
                      <Text style={styles.coordinateText}>
                        {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                      </Text>
                    </>
                  ) : polygonPoints.length >= 3 ? (
                    <>
                      <Ionicons name="shapes" size={16} color="#28a745" />
                      <Text style={styles.coordinateText}>
                        {polygonPoints.length} points • {formatArea(calculatePolygonArea(polygonPoints))}
                      </Text>
                    </>
                  ) : null}
                </View>

                <Text style={styles.label}>Pond Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    keyboardOffset > 0 && styles.inputKeyboard,
                  ]}
                  value={pondName}
                  onChangeText={setPondName}
                  placeholder="e.g., Pond A, North Farm Pond 1"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreatePond}
                  blurOnSubmit
                />
              </ScrollView>

              <View
                style={[
                  styles.modalButtons,
                  styles.modalFooter,
                  {
                    paddingBottom:
                      keyboardOffset > 0
                        ? 16
                        : restingSheetBottom,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setModalVisible(false);
                    setPondName('');
                  }}
                  disabled={loading}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmButton, !pondName.trim() && styles.buttonDisabled]}
                  onPress={handleCreatePond}
                  disabled={!pondName.trim() || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.modalConfirmText}>Create</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  map: {
    flex: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  mapTypeButton: {
    width: 44,
    height: 44,
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapTypeLabel: {
    backgroundColor: 'rgba(0, 123, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  mapInfoRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  mapLocateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: '#b7d4f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modeIndicator: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0, 123, 255, 0.9)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  modeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  emptyMapHint: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13, 148, 217, 0.18)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptyMapHintText: {
    color: '#0b6aa8',
    fontSize: 12,
    fontWeight: '600',
  },
  areaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 163, 74, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
  },
  areaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  addControls: {
    alignItems: 'flex-end',
  },
  addHintCard: {
    maxWidth: 250,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#c7ddf3',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  addHintText: {
    color: '#0b6aa8',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  addPondButton: {
    backgroundColor: '#007bff',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    height: 56,
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 8,
  },
  addPondButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  editControls: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#c8def3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 8,
  },
  editHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#edf6ff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  editHintText: {
    color: '#0b6aa8',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  editButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  undoText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelEditButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelEditText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1.2,
    backgroundColor: '#28a745',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmButtonDisabled: {
    backgroundColor: '#92c9a0',
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalContentKeyboard: {
    flexShrink: 1,
  },
  modalBody: {
    flexShrink: 1,
  },
  modalContentInner: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  modalContentInnerKeyboard: {
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  infoBox: {
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coordinateText: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e4e8',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 0,
  },
  inputKeyboard: {
    paddingVertical: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 2,
    backgroundColor: '#007bff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
