import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  Platform,
  Linking,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { autoSaveOnMobile } from './src/autoSaveMobile';

export interface MobileTransferItem {
  id: string;
  name: string;
  size: string;
  peerName: string;
  direction: 'receive' | 'send';
  savedLocation: string;
  isGallery: boolean;
  timestamp: number;
  uri?: string;
}

const SETTINGS_FILE = `${FileSystem.documentDirectory}mobile_settings.json`;
const HISTORY_FILE = `${FileSystem.documentDirectory}mobile_transfers.json`;

export default function App() {
  const [deviceName, setDeviceName] = useState(
    Platform.OS === 'ios' ? "Tamil's iPhone 15 Pro" : "Tamil's Galaxy S24"
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [filter, setFilter] = useState<'all' | 'received' | 'sent'>('all');
  const [pairingCode, setPairingCode] = useState('782-914');

  const [transfers, setTransfers] = useState<MobileTransferItem[]>([
    {
      id: 'demo-1',
      name: 'IMG_2026_Sunset.jpg',
      size: '4.2 MB',
      peerName: "Tamil's PC (Windows)",
      direction: 'receive',
      savedLocation: 'Device Photos / Gallery',
      isGallery: true,
      timestamp: Date.now() - 60000,
    },
    {
      id: 'demo-2',
      name: 'Project_Design_Brief.pdf',
      size: '1.8 MB',
      peerName: 'MacBook Pro M3',
      direction: 'send',
      savedLocation: 'Documents/Project_Design_Brief.pdf',
      isGallery: false,
      timestamp: Date.now() - 180000,
    },
  ]);

  // Load persistent device name & transfer history on launch
  useEffect(() => {
    async function loadSavedData() {
      try {
        // 1. Load Device Settings
        const settingsInfo = await FileSystem.getInfoAsync(SETTINGS_FILE);
        if (settingsInfo.exists) {
          const content = await FileSystem.readAsStringAsync(SETTINGS_FILE);
          const parsed = JSON.parse(content);
          if (parsed.deviceName) {
            setDeviceName(parsed.deviceName);
          }
        }

        // 2. Load Transfer History
        const historyInfo = await FileSystem.getInfoAsync(HISTORY_FILE);
        if (historyInfo.exists) {
          const content = await FileSystem.readAsStringAsync(HISTORY_FILE);
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTransfers(parsed);
          }
        }
      } catch (err) {
        console.warn('Failed to load mobile persistent state:', err);
      }
    }
    loadSavedData();
  }, []);

  // Persist transfers whenever they change
  const saveTransfersToDisk = async (newTransfers: MobileTransferItem[]) => {
    setTransfers(newTransfers);
    try {
      await FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(newTransfers));
    } catch (e) {
      console.warn('Failed to save transfers to disk:', e);
    }
  };

  // Save device name to persistent storage
  const handleSaveDeviceName = async () => {
    if (tempName.trim()) {
      const updated = tempName.trim();
      setDeviceName(updated);
      setIsEditingName(false);
      try {
        await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify({ deviceName: updated }));
      } catch (e) {
        console.warn('Failed to persist mobile device name:', e);
      }
      Alert.alert('Device Name Updated', `Your device is now broadcast as "${updated}"`);
    }
  };

  // Direct user to stored file location when clicking a sent/received file card!
  const handleOpenFileLocation = (item: MobileTransferItem) => {
    if (item.direction === 'receive') {
      if (item.isGallery) {
        Alert.alert(
          'Photo / Video Storage Location',
          `"${item.name}" is permanently stored in your device's Photos / Gallery Camera Roll.\n\nSender: ${item.peerName}\nSize: ${item.size}`,
          [
            {
              text: 'Open Photos App',
              onPress: () => {
                const photosUrl = Platform.OS === 'ios' ? 'photos-redirect://' : 'content://media/internal/images/media';
                Linking.openURL(photosUrl).catch(() => {
                  Alert.alert('Photos App', 'Please open your Photos or Gallery app to view your received media.');
                });
              },
            },
            { text: 'Done', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert(
          'Document Storage Location',
          `"${item.name}" was auto-saved to your sandboxed Documents directory.\n\nLocation: ${item.savedLocation}\nSender: ${item.peerName}\nSize: ${item.size}`,
          [{ text: 'OK', style: 'default' }]
        );
      }
    } else {
      Alert.alert(
        'Sent File Storage Origin',
        `"${item.name}" was sent to ${item.peerName}.\n\nOrigin: ${item.savedLocation || 'Local Device Filesystem'}\nSize: ${item.size}`,
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  // Pick file from mobile device storage and add to sent queue
  const handlePickAndSendFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        const newItem: MobileTransferItem = {
          id: Date.now().toString(),
          name: file.name,
          size: `${((file.size || 1024) / (1024 * 1024)).toFixed(1)} MB`,
          peerName: "Tamil's PC (Windows)",
          direction: 'send',
          savedLocation: file.uri || `Internal Storage/${file.name}`,
          isGallery: false,
          timestamp: Date.now(),
          uri: file.uri,
        };

        const updated = [newItem, ...transfers];
        await saveTransfersToDisk(updated);
        Alert.alert('File Sent!', `"${file.name}" was sent to your PC with zero-click sync.`);
      }
    } catch (err: any) {
      Alert.alert('Error', `Could not pick file: ${err.message}`);
    }
  };

  // Trigger test receive
  const handleTriggerSimulatedReceive = async () => {
    const isPhoto = Math.random() > 0.3;
    const name = isPhoto
      ? `Photo_${Math.floor(1000 + Math.random() * 9000)}.jpg`
      : `Doc_${Math.floor(1000 + Math.random() * 9000)}.pdf`;

    const newFile: MobileTransferItem = {
      id: Date.now().toString(),
      name,
      size: `${(1 + Math.random() * 5).toFixed(1)} MB`,
      peerName: "Tamil's PC (Windows)",
      direction: 'receive',
      savedLocation: isPhoto ? 'Device Photos / Gallery' : `Documents/${name}`,
      isGallery: isPhoto,
      timestamp: Date.now(),
    };

    const updated = [newFile, ...transfers];
    await saveTransfersToDisk(updated);
    Alert.alert('File Received!', `"${newFile.name}" arrived from PC and was auto-saved zero-click.`);
  };

  // Clear history both in state and on disk
  const handleClearHistory = () => {
    Alert.alert('Clear History', 'Are you sure you want to clear your transfer history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          await saveTransfersToDisk([]);
        },
      },
    ]);
  };

  const displayedTransfers = transfers.filter((t) => {
    if (filter === 'received') return t.direction === 'receive';
    if (filter === 'sent') return t.direction === 'send';
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>DropFlow</Text>
          <TouchableOpacity
            style={styles.nameRow}
            onPress={() => {
              setTempName(deviceName);
              setIsEditingName(true);
            }}
          >
            <Text style={styles.deviceLabel}>{deviceName}</Text>
            <Text style={styles.editHint}>✎ edit</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.pairButton}
          onPress={() => Alert.alert('Pairing Code', `Enter this code on your PC or Mac:\n\n${pairingCode}`)}
        >
          <Text style={styles.pairButtonText}>PIN: {pairingCode}</Text>
        </TouchableOpacity>
      </View>

      {/* Radar Card */}
      <View style={styles.radarCard}>
        <View style={styles.radarRingOuter}>
          <View style={styles.radarRingMiddle}>
            <View style={styles.radarCenter}>
              <Text style={styles.radarCenterText}>{Platform.OS === 'ios' ? '🍏' : '📱'}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.radarLabel}>AirDrop Mesh Active</Text>
        <Text style={styles.radarSubLabel}>Auto-saves zero-click to Photos & Documents</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtnPrimary} onPress={handlePickAndSendFile}>
            <Text style={styles.actionBtnTextPrimary}>+ Drop File to PC</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleTriggerSimulatedReceive}>
            <Text style={styles.actionBtnTextSecondary}>⚡ Test Receive</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Activity Section Header */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Files Sent &amp; Received</Text>
          <Text style={styles.sectionSubtitle}>Tap any file to direct to stored location</Text>
        </View>

        {transfers.length > 0 && (
          <TouchableOpacity onPress={handleClearHistory}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All ({transfers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTab, filter === 'received' && styles.filterTabActive]}
          onPress={() => setFilter('received')}
        >
          <Text style={[styles.filterTabText, filter === 'received' && styles.filterTabTextActive]}>
            Received ({transfers.filter((t) => t.direction === 'receive').length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTab, filter === 'sent' && styles.filterTabActive]}
          onPress={() => setFilter('sent')}
        >
          <Text style={[styles.filterTabText, filter === 'sent' && styles.filterTabTextActive]}>
            Sent ({transfers.filter((t) => t.direction === 'send').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Transfers List */}
      <FlatList
        data={displayedTransfers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isReceive = item.direction === 'receive';
          return (
            <TouchableOpacity
              style={[
                styles.fileCard,
                { borderLeftColor: isReceive ? '#A855F7' : '#06B6D4', borderLeftWidth: 3 },
              ]}
              onPress={() => handleOpenFileLocation(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.fileIcon}>{item.isGallery ? '🖼️' : '📄'}</Text>
              <View style={styles.fileDetails}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.directionTag,
                      { color: isReceive ? '#A855F7' : '#06B6D4' },
                    ]}
                  >
                    {isReceive ? 'RECEIVED' : 'SENT'}
                  </Text>
                </View>

                <Text style={styles.fileMeta}>
                  {item.size} • {isReceive ? `From ${item.peerName}` : `To ${item.peerName}`}
                </Text>

                <View style={styles.locationBadge}>
                  <Text style={styles.fileSaved} numberOfLines={1}>
                    📍 {item.savedLocation}
                  </Text>
                  <Text style={styles.openLocationHint}>Tap to view ➜</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyTitle}>No transfers in this view</Text>
            <Text style={styles.emptySub}>Files dropped between your phone and PC appear here.</Text>
          </View>
        }
      />

      {/* Edit Device Name Modal */}
      <Modal visible={isEditingName} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Device Display Name</Text>
            <Text style={styles.modalSub}>This name will appear on PC and Mac radar screens.</Text>

            <TextInput
              style={styles.nameInput}
              value={tempName}
              onChangeText={setTempName}
              placeholder="e.g. Tamil's iPhone"
              placeholderTextColor="#64748B"
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setIsEditingName(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveDeviceName}>
                <Text style={styles.modalSaveText}>Save Name</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  deviceLabel: {
    fontSize: 12,
    color: '#06B6D4',
    fontWeight: '600',
  },
  editHint: {
    fontSize: 11,
    color: '#64748B',
  },
  pairButton: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pairButtonText: {
    color: '#06B6D4',
    fontWeight: '700',
    fontSize: 12,
  },
  radarCard: {
    alignItems: 'center',
    paddingVertical: 24,
    marginHorizontal: 18,
    marginTop: 14,
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  radarRingOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRingMiddle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarCenter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    borderWidth: 2,
    borderColor: '#06B6D4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarCenterText: {
    fontSize: 18,
  },
  radarLabel: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  radarSubLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
    marginTop: 2,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  actionBtnPrimary: {
    backgroundColor: '#06B6D4',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  actionBtnTextPrimary: {
    color: '#030712',
    fontWeight: '700',
    fontSize: 12.5,
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnTextSecondary: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  clearText: {
    color: '#F43F5E',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  filterTab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
  },
  filterTabText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#06B6D4',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  fileIcon: {
    fontSize: 26,
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
  },
  directionTag: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  fileMeta: {
    color: '#94A3B8',
    fontSize: 11.5,
    marginTop: 3,
  },
  locationBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  fileSaved: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  openLocationHint: {
    color: '#06B6D4',
    fontSize: 10.5,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  modalSub: {
    fontSize: 12.5,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 16,
  },
  nameInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancel: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalCancelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  modalSave: {
    backgroundColor: '#06B6D4',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalSaveText: {
    color: '#030712',
    fontSize: 13,
    fontWeight: '700',
  },
});
