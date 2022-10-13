// -*- mode:C++; tab-width:8; c-basic-offset:2; indent-tabs-mode:t -*-
// vim: ts=8 sw=2 smarttab

#pragma once

#include <iosfwd>

#include <boost/intrusive_ptr.hpp>
#include <boost/smart_ptr/intrusive_ref_counter.hpp>
#include <seastar/core/future.hh>

#include "include/ceph_assert.h"
#include "crimson/os/seastore/seastore_types.h"
#include "include/buffer_fwd.h"
#include "crimson/osd/exceptions.h"

#include "crimson/os/seastore/transaction.h"

#include "crimson/common/layout.h"
#include "include/buffer.h"
#include "crimson/os/seastore/device.h"

namespace crimson::os::seastore {

struct rbm_metadata_header_t {
  size_t size = 0;
  size_t block_size = 0;
  uint64_t start = 0; // start location of the device
  uint64_t feature = 0;
  uint32_t start_data_area = 0;
  checksum_t crc = 0;
  device_config_t config;

  DENC(rbm_metadata_header_t, v, p) {
    DENC_START(1, 1, p);
    denc(v.size, p);
    denc(v.block_size, p);
    denc(v.start, p);
    denc(v.feature, p);

    denc(v.start_data_area, p);
    denc(v.crc, p);
    denc(v.config, p);
    DENC_FINISH(p);
  }

};

class Device;
class RandomBlockManager {
public:

  using read_ertr = crimson::errorator<
    crimson::ct_error::input_output_error,
    crimson::ct_error::invarg,
    crimson::ct_error::enoent,
    crimson::ct_error::erange>;
  virtual read_ertr::future<> read(paddr_t addr, bufferptr &buffer) = 0;

  using write_ertr = crimson::errorator<
    crimson::ct_error::input_output_error,
    crimson::ct_error::invarg,
    crimson::ct_error::ebadf,
    crimson::ct_error::enospc,
    crimson::ct_error::erange
    >;
  virtual write_ertr::future<> write(paddr_t addr, bufferptr &buf) = 0;

  using open_ertr = crimson::errorator<
    crimson::ct_error::input_output_error,
    crimson::ct_error::invarg,
    crimson::ct_error::enoent>;
  virtual open_ertr::future<> open() = 0;

  using close_ertr = crimson::errorator<
    crimson::ct_error::input_output_error,
    crimson::ct_error::invarg>;
  virtual close_ertr::future<> close() = 0;

  using allocate_ertr = crimson::errorator<
    crimson::ct_error::input_output_error,
    crimson::ct_error::invarg,
    crimson::ct_error::enospc
    >;
  using allocate_ret = allocate_ertr::future<paddr_t>;
  // allocator, return start addr of allocated blocks
  virtual allocate_ret alloc_extent(Transaction &t, size_t size) = 0;

  using abort_allocation_ertr = crimson::errorator<
    crimson::ct_error::input_output_error,
    crimson::ct_error::invarg
    >;
  virtual abort_allocation_ertr::future<> abort_allocation(Transaction &t) = 0;

  using complete_allocation_ertr = crimson::errorator<
    crimson::ct_error::input_output_error,
    crimson::ct_error::invarg,
    crimson::ct_error::enoent,
    crimson::ct_error::erange
    >;
  virtual write_ertr::future<> complete_allocation(Transaction &t) = 0;

  virtual size_t get_size() const = 0;
  virtual extent_len_t get_block_size() const = 0;
  virtual uint64_t get_free_blocks() const = 0;
  virtual device_id_t get_device_id() const = 0;
  virtual ~RandomBlockManager() {}
};
using RandomBlockManagerRef = std::unique_ptr<RandomBlockManager>;
using blk_no_t = uint64_t;
using rbm_abs_addr = uint64_t;

inline rbm_abs_addr convert_paddr_to_abs_addr(const paddr_t& paddr) {
  const blk_paddr_t& blk_addr = paddr.as_blk_paddr();
  return blk_addr.get_device_off();
}

inline paddr_t convert_abs_addr_to_paddr(rbm_abs_addr addr, device_id_t d_id) {
  return paddr_t::make_blk_paddr(d_id, addr);
}
std::ostream &operator<<(std::ostream &out, const rbm_metadata_header_t &header);
}

WRITE_CLASS_DENC_BOUNDED(
  crimson::os::seastore::rbm_metadata_header_t
)
